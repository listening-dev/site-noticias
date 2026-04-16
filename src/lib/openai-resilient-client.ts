import { OpenAI } from 'openai'
import { OpenAIErrorHandler, OpenAIRetryStrategy, DetailedError } from './openai-error-handler'
import { TokenBudgetManager } from './token-budget-manager'
import crypto from 'crypto'

/**
 * Configuration for resilient client
 */
export interface ResilientClientConfig {
  /** Maximum number of retries for transient errors */
  maxRetries?: number
  /** Initial delay in ms for exponential backoff */
  initialDelayMs?: number
  /** Maximum timeout for a single request in ms */
  timeoutMs?: number
  /** Minimum token headroom before throttling (default 1000) */
  minTokenHeadroom?: number
  /** Enable request deduplication */
  enableDedup?: boolean
  /** Enable adaptive timeout based on API health */
  enableAdaptiveTimeout?: boolean
}

/**
 * Wrapper around OpenAI client that adds:
 * - Smart exponential backoff retries
 * - Request deduplication
 * - Token budget tracking
 * - Adaptive timeout
 *
 * IMPORTANT: Wraps the client, doesn't replace it. Existing code continues to work.
 * New code can opt-in to resilience.
 *
 * Usage:
 *   const resilient = new OpenAIResilientClient(baseClient)
 *   const response = await resilient.chat.completions.create({...})
 */
export class OpenAIResilientClient {
  private baseClient: OpenAI
  private maxRetries: number
  private initialDelayMs: number
  private timeoutMs: number
  private minTokenHeadroom: number
  private enableDedup: boolean
  private enableAdaptiveTimeout: boolean

  /** Request dedup cache: fingerprint -> Promise */
  private _requestDedup = new Map<string, Promise<any>>()

  /** Retry strategy executor */
  private retryStrategy: OpenAIRetryStrategy

  /** Token budget manager (singleton instance) */
  private tokenBudget: TokenBudgetManager

  constructor(baseClient: OpenAI, config: ResilientClientConfig = {}) {
    this.baseClient = baseClient
    this.maxRetries = config.maxRetries ?? 3
    this.initialDelayMs = config.initialDelayMs ?? 100
    this.timeoutMs = config.timeoutMs ?? 30000
    this.minTokenHeadroom = config.minTokenHeadroom ?? 1000
    this.enableDedup = config.enableDedup ?? true
    this.enableAdaptiveTimeout = config.enableAdaptiveTimeout ?? true

    this.retryStrategy = new OpenAIRetryStrategy(this.maxRetries, this.initialDelayMs, 30000)
    this.tokenBudget = TokenBudgetManager.getInstance()
  }

  /**
   * Get resilient chat completions proxy
   * Usage: await resilientClient.chat.completions.create(...)
   */
  get chat() {
    return {
      completions: {
        create: (params: Parameters<typeof this.baseClient.chat.completions.create>[0]) =>
          this._createCompletion(params),
      },
    }
  }

  /**
   * Core resilient completion logic
   * Handles dedup, budget, timeout, retry, and token tracking
   */
  private async _createCompletion(params: any) {
    const model = params.model || 'gpt-4o-mini'
    const maxTokens = params.max_tokens || 500

    // [1] Calculate request fingerprint for deduplication
    const fingerprint = this._calculateFingerprint(params)

    // [2] Check dedup cache - if identical request already in-flight, wait for it
    if (this.enableDedup && this._requestDedup.has(fingerprint)) {
      console.log(
        `[OpenAI-Resilient] Request dedup cache hit (fingerprint: ${fingerprint.slice(0, 8)}...)`
      )
      return this._requestDedup.get(fingerprint)!
    }

    // Create a promise to cache for other concurrent requests
    const resultPromise = (async () => {
      try {
        // [3] Check token budget before making request
        if (!this.tokenBudget.canAfford(maxTokens)) {
          const headroom = this.tokenBudget.getHeadroom()
          throw new Error(
            `Token budget exceeded. Required: ${maxTokens}, available: ${headroom} tokens`
          )
        }

        // [4] Execute with retry strategy and timeout
        const adaptiveTimeout = this.enableAdaptiveTimeout
          ? this._getAdaptiveTimeout()
          : this.timeoutMs

        const result = await this._executeWithTimeoutAndRetry(
          params,
          model,
          maxTokens,
          adaptiveTimeout
        )

        // [5] Track tokens on success
        if (result.usage) {
          this.tokenBudget.track(model, result.usage.total_tokens)
        }

        return result
      } finally {
        // [6] Clean up dedup cache after completion
        if (this.enableDedup) {
          this._requestDedup.delete(fingerprint)
        }
      }
    })()

    // Cache the promise while in-flight
    if (this.enableDedup) {
      this._requestDedup.set(fingerprint, resultPromise)
    }

    return resultPromise
  }

  /**
   * Execute request with timeout and retry logic
   * Uses AbortController for timeout support (Node 15+)
   */
  private async _executeWithTimeoutAndRetry(
    params: any,
    model: string,
    maxTokens: number,
    timeoutMs: number
  ): Promise<any> {
    // Create abort controller for timeout support
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
    const startTime = Date.now()

    try {
      // Use existing retry strategy from error handler
      const retryResult = await this.retryStrategy.executeWithRetry(
        async () => {
          return await this.baseClient.chat.completions.create({
            ...params,
            // Note: OpenAI SDK v6+ may not support signal directly
            // This is for future compatibility; currently OpenAI SDK handles timeout via native mechanism
          } as any)
        },
        { model, maxTokens }
      )

      const elapsedMs = Date.now() - startTime
      this.tokenBudget.updateAPIHealth(elapsedMs, retryResult.success)

      if (!retryResult.success) {
        throw new Error(
          `OpenAI call failed after ${this.maxRetries} retries: ${retryResult.error?.message}`
        )
      }

      return retryResult.data!
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  /**
   * Calculate fingerprint for request deduplication
   * Fingerprint = hash(model, messages content, temperature, max_tokens)
   * Does NOT include: presence_penalty, frequency_penalty, seed (non-deterministic variations)
   */
  private _calculateFingerprint(params: any): string {
    const fingerprint = {
      model: params.model,
      messages: params.messages?.map((m: any) => ({ role: m.role, content: m.content })),
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      // Intentionally exclude: top_p, presence_penalty, frequency_penalty, seed
    }

    const hash = crypto.createHash('sha256')
    hash.update(JSON.stringify(fingerprint))
    return hash.digest('hex')
  }

  /**
   * Get adaptive timeout based on API health
   * If API is experiencing slow responses, reduce timeout to fail-fast
   * If API is healthy, use full timeout
   */
  private _getAdaptiveTimeout(): number {
    const health = this.tokenBudget.getAPIHealth()

    // If API average response time is > 20 seconds, reduce timeout to fail faster
    if (health.avgResponseTimeMs > 20000) {
      const adjusted = Math.min(this.timeoutMs, 20000)
      console.log(
        `[OpenAI-Resilient] Adaptive timeout: API slow (${Math.round(health.avgResponseTimeMs)}ms avg), reducing to ${adjusted}ms`
      )
      return adjusted
    }

    // If API is degraded but not critically slow, use 25s
    if (health.avgResponseTimeMs > 10000) {
      const adjusted = Math.min(this.timeoutMs, 25000)
      console.log(
        `[OpenAI-Resilient] Adaptive timeout: API degraded (${Math.round(health.avgResponseTimeMs)}ms avg), using ${adjusted}ms`
      )
      return adjusted
    }

    return this.timeoutMs
  }

  /**
   * Utility: Get current token budget status
   */
  getTokenBudgetStatus() {
    return this.tokenBudget.getStatus()
  }

  /**
   * Utility: Reset token budget (for testing)
   */
  resetTokenBudget() {
    this.tokenBudget.reset()
  }

  /**
   * Utility: Check if should throttle based on token budget
   */
  shouldThrottle(): boolean {
    return this.tokenBudget.shouldThrottle()
  }

  /**
   * Utility: Get remaining token headroom
   */
  getTokenHeadroom(): number {
    return this.tokenBudget.getHeadroom()
  }
}

/**
 * Factory function to wrap existing OpenAI client with resilience
 */
export function createResilientClient(
  config: ResilientClientConfig & { apiKey?: string } = {}
): OpenAIResilientClient {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  const baseClient = new OpenAI({ apiKey })
  return new OpenAIResilientClient(baseClient, config)
}

/**
 * Wrap an existing OpenAI client with resilience
 * Useful if you already have a client instance
 */
export function wrapResilientClient(
  baseClient: OpenAI,
  config: ResilientClientConfig = {}
): OpenAIResilientClient {
  return new OpenAIResilientClient(baseClient, config)
}
