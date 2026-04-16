import { OpenAI } from 'openai'

/**
 * Categorization of OpenAI errors into actionable types
 * Each type carries info about retry strategy, severity, and fallback behavior
 */

export type OpenAIErrorType =
  | 'RateLimitError'
  | 'APIError'
  | 'AuthenticationError'
  | 'ValidationError'
  | 'NetworkError'
  | 'TimeoutError'
  | 'UnknownError'

export type ErrorSeverity = 'fatal' | 'degraded'

/**
 * Detailed error object with classification, logging context, and retry guidance
 * Allows callers to decide: retry, use fallback, or propagate to user
 */
export interface DetailedError {
  /** Error classification */
  type: OpenAIErrorType
  /** Human-readable message */
  message: string
  /** Can this error be retried? */
  canRetry: boolean
  /** How severe is this? fatal = unrecoverable, degraded = fallback acceptable */
  severity: ErrorSeverity
  /** Original error object for debugging */
  originalError: Error | null
  /** OpenAI-specific error details if available */
  openaiDetails?: {
    status?: number
    code?: string
    requestId?: string
  }
  /** Context about what was being processed */
  context: {
    model: string
    maxTokens?: number
    inputLength?: number
    timestamp: string
  }
  /** Suggested retry delay in milliseconds (for rate limits) */
  retryAfterMs?: number
}

/**
 * OpenAI Error Handler
 * Classifies errors, extracts context, and provides structured error info
 */
export class OpenAIErrorHandler {
  /**
   * Classify an error from OpenAI API call
   * @param error - The error object to classify
   * @param context - Context about the API call (model, tokens, etc)
   * @returns DetailedError with classification and guidance
   */
  static classify(
    error: unknown,
    context: {
      model: string
      maxTokens?: number
      inputLength?: number
    }
  ): DetailedError {
    const errorObj = error instanceof Error ? error : new Error(String(error))
    const timestamp = new Date().toISOString()

    // Check for OpenAI SDK specific errors
    if (error instanceof OpenAI.RateLimitError) {
      const retryAfterMs = this.extractRetryAfterMs(errorObj)
      return {
        type: 'RateLimitError',
        message: `OpenAI API rate limit exceeded. Wait ${retryAfterMs}ms before retry.`,
        canRetry: true,
        severity: 'degraded',
        originalError: errorObj,
        openaiDetails: this.extractOpenAIDetails(errorObj),
        context: { ...context, timestamp },
        retryAfterMs,
      }
    }

    if (error instanceof OpenAI.AuthenticationError) {
      return {
        type: 'AuthenticationError',
        message: 'OpenAI API authentication failed. Check OPENAI_API_KEY.',
        canRetry: false,
        severity: 'fatal',
        originalError: errorObj,
        openaiDetails: this.extractOpenAIDetails(errorObj),
        context: { ...context, timestamp },
      }
    }

    // Check for validation errors (status 400)
    const status = (error as any).status
    if (status === 400) {
      return {
        type: 'ValidationError',
        message: `Invalid request to OpenAI: ${errorObj.message}`,
        canRetry: false,
        severity: 'fatal',
        originalError: errorObj,
        openaiDetails: this.extractOpenAIDetails(errorObj),
        context: { ...context, timestamp },
      }
    }

    if (error instanceof OpenAI.APIError) {
      const isServerError = status && status >= 500
      const isTransient = isServerError || status === 429 || status === 408

      return {
        type: 'APIError',
        message: `OpenAI API error (${status || 'unknown'}): ${errorObj.message}`,
        canRetry: isTransient,
        severity: isServerError ? 'degraded' : 'fatal',
        originalError: errorObj,
        openaiDetails: this.extractOpenAIDetails(errorObj),
        context: { ...context, timestamp },
      }
    }

    // Check for network-level errors
    if (this.isNetworkError(errorObj)) {
      return {
        type: 'NetworkError',
        message: `Network error connecting to OpenAI: ${errorObj.message}`,
        canRetry: true,
        severity: 'degraded',
        originalError: errorObj,
        context: { ...context, timestamp },
      }
    }

    // Check for timeout
    if (this.isTimeoutError(errorObj)) {
      return {
        type: 'TimeoutError',
        message: 'OpenAI API request timed out',
        canRetry: true,
        severity: 'degraded',
        originalError: errorObj,
        context: { ...context, timestamp },
      }
    }

    // Unknown error
    return {
      type: 'UnknownError',
      message: `Unknown error during OpenAI call: ${errorObj.message}`,
      canRetry: false,
      severity: 'fatal',
      originalError: errorObj,
      context: { ...context, timestamp },
    }
  }

  /**
   * Extract retry-after header or default to exponential backoff
   */
  private static extractRetryAfterMs(error: Error): number {
    const errorStr = error.message + error.stack || ''

    // Try to find retry-after header value
    const retryAfterMatch = errorStr.match(/retry[_-]after["\s:]*(\d+)/i)
    if (retryAfterMatch) {
      const seconds = parseInt(retryAfterMatch[1])
      return seconds * 1000
    }

    // Default: 60s for rate limits
    return 60000
  }

  /**
   * Extract OpenAI-specific error details for logging
   */
  private static extractOpenAIDetails(error: Error): DetailedError['openaiDetails'] {
    const details: DetailedError['openaiDetails'] = {}

    if ((error as any).status) {
      details.status = (error as any).status
    }

    if ((error as any).code) {
      details.code = (error as any).code
    }

    if ((error as any).headers) {
      details.requestId = (error as any).headers['x-request-id']
    }

    return Object.keys(details).length > 0 ? details : undefined
  }

  /**
   * Check if error is network-related
   */
  private static isNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase()
    return (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      message.includes('network') ||
      message.includes('unreachable')
    )
  }

  /**
   * Check if error is timeout-related
   */
  private static isTimeoutError(error: Error): boolean {
    const message = error.message.toLowerCase()
    return (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('deadline')
    )
  }
}

/**
 * Logger for OpenAI errors with full context for analytics/dashboards
 * Can be extended to send to external logging service
 */
export class OpenAIErrorLogger {
  /**
   * Log a categorized error with full context
   * In production, this could send to Sentry, DataDog, CloudWatch, etc
   */
  static log(
    detailedError: DetailedError,
    options?: {
      newsId?: string
      batchSize?: number
      successCount?: number
      failureCount?: number
    }
  ): void {
    const logEntry = {
      timestamp: detailedError.context.timestamp,
      error: {
        type: detailedError.type,
        severity: detailedError.severity,
        message: detailedError.message,
        canRetry: detailedError.canRetry,
        retryAfterMs: detailedError.retryAfterMs,
      },
      context: {
        model: detailedError.context.model,
        maxTokens: detailedError.context.maxTokens,
        inputLength: detailedError.context.inputLength,
      },
      openaiDetails: detailedError.openaiDetails,
      batch: {
        newsId: options?.newsId,
        size: options?.batchSize,
        successCount: options?.successCount,
        failureCount: options?.failureCount,
      },
      stack: detailedError.originalError?.stack,
    }

    // Console logging for development
    console.error('[OpenAI-Error]', JSON.stringify(logEntry, null, 2))

    // TODO: Send to external logging service
    // await logToExternalService(logEntry)
  }

  /**
   * Log batch processing results with error breakdown
   */
  static logBatchResults(
    results: Array<{
      newsId: string
      success: boolean
      error?: DetailedError
    }>,
    model: string
  ): void {
    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    const errorsByType = results
      .filter((r) => r.error)
      .reduce(
        (acc, r) => {
          const type = r.error!.type
          acc[type] = (acc[type] || 0) + 1
          return acc
        },
        {} as Record<OpenAIErrorType, number>
      )

    const summary = {
      timestamp: new Date().toISOString(),
      batch: {
        total: results.length,
        successful,
        failed,
        successRate: ((successful / results.length) * 100).toFixed(2) + '%',
      },
      errorsByType,
      model,
    }

    console.info('[OpenAI-Batch-Summary]', JSON.stringify(summary, null, 2))
  }
}

/**
 * Retry strategy for OpenAI calls
 * Implements exponential backoff with jitter
 */
export class OpenAIRetryStrategy {
  constructor(
    private maxRetries: number = 3,
    private baseDelayMs: number = 1000,
    private maxDelayMs: number = 30000
  ) {}

  /**
   * Execute a function with automatic retry on transient errors
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    context: { model: string; maxTokens?: number }
  ): Promise<{ success: boolean; data?: T; error?: DetailedError }> {
    let lastError: DetailedError | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const data = await fn()
        return { success: true, data }
      } catch (error) {
        const classified = OpenAIErrorHandler.classify(error, context)
        lastError = classified

        // Log the error
        OpenAIErrorLogger.log(classified, {
          batchSize: 1,
          failureCount: 1,
          successCount: 0,
        })

        if (!classified.canRetry) {
          return { success: false, error: classified }
        }

        if (attempt < this.maxRetries) {
          // Calculate delay: use retryAfterMs if available, otherwise exponential backoff
          const delay = classified.retryAfterMs || this.calculateBackoffDelay(attempt)
          console.log(`[OpenAI-Retry] Attempt ${attempt + 1}/${this.maxRetries}, waiting ${delay}ms`)
          await this.sleep(delay)
        }
      }
    }

    return { success: false, error: lastError! }
  }

  private calculateBackoffDelay(attempt: number): number {
    const exponential = this.baseDelayMs * Math.pow(2, attempt)
    const jitter = Math.random() * exponential * 0.1 // 10% jitter
    return Math.min(exponential + jitter, this.maxDelayMs)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
