/**
 * Configuration for token budget
 */
export interface TokenBudgetConfig {
  /** Daily token limit (default 100000 for free tier) */
  dailyLimit?: number
  /** Minimum headroom before throttling (default 1000 tokens) */
  minHeadroom?: number
  /** Enable token budget enforcement */
  enabled?: boolean
}

/**
 * Model-specific statistics
 */
interface ModelStats {
  model: string
  totalTokens: number
  requestCount: number
  avgTokensPerRequest: number
  lastUpdated: number
}

/**
 * API health metrics
 */
export interface APIHealth {
  avgResponseTimeMs: number
  errorRate: number
  lastChecked: number
}

/**
 * Token budget manager (Singleton pattern)
 * Tracks cumulative token usage per day and prevents rate limit surprises
 *
 * Usage:
 *   const budget = TokenBudgetManager.getInstance()
 *   budget.track('gpt-4o-mini', 165)
 *   console.log(budget.getStatus())
 */
export class TokenBudgetManager {
  private static instance: TokenBudgetManager | null = null

  private dailyLimit: number
  private minHeadroom: number
  private enabled: boolean

  private usedToday: number = 0
  private resetTime: number = this._getResetTime()
  private modelStats = new Map<string, ModelStats>()
  private apiHealth: APIHealth = { avgResponseTimeMs: 0, errorRate: 0, lastChecked: Date.now() }

  private constructor(config: TokenBudgetConfig = {}) {
    this.dailyLimit = config.dailyLimit || 100000
    this.minHeadroom = config.minHeadroom || 1000
    this.enabled = config.enabled !== false

    console.log(
      `[Token-Budget] Initialized with limit: ${this.dailyLimit} tokens/day, headroom: ${this.minHeadroom} tokens`
    )
  }

  /**
   * Get singleton instance
   * Creates instance on first call with optional config
   */
  static getInstance(config?: TokenBudgetConfig): TokenBudgetManager {
    if (!TokenBudgetManager.instance) {
      TokenBudgetManager.instance = new TokenBudgetManager(config)
    }
    return TokenBudgetManager.instance
  }

  /**
   * Reset singleton (for testing only)
   */
  static reset() {
    TokenBudgetManager.instance = null
  }

  /**
   * Track token usage after successful API call
   * Updates internal state and logs usage
   */
  track(model: string, tokens: number): void {
    if (!this.enabled) return

    // Check if we need to reset (new day)
    if (Date.now() > this.resetTime) {
      this._resetDaily()
    }

    this.usedToday += tokens

    // Update model stats
    if (!this.modelStats.has(model)) {
      this.modelStats.set(model, {
        model,
        totalTokens: 0,
        requestCount: 0,
        avgTokensPerRequest: 0,
        lastUpdated: Date.now(),
      })
    }

    const stats = this.modelStats.get(model)!
    stats.totalTokens += tokens
    stats.requestCount += 1
    stats.avgTokensPerRequest = stats.totalTokens / stats.requestCount
    stats.lastUpdated = Date.now()

    // Log for monitoring
    const headroom = this.dailyLimit - this.usedToday
    const percentUsed = ((this.usedToday / this.dailyLimit) * 100).toFixed(1)
    console.log(
      `[Token-Budget] ${model}: +${tokens} tokens | Total: ${this.usedToday}/${this.dailyLimit} (${percentUsed}%) | Headroom: ${headroom}`
    )

    // Warn if approaching limit
    if (headroom < this.minHeadroom) {
      console.warn(
        `[Token-Budget] WARNING: Approaching daily limit! Only ${headroom} tokens remaining.`
      )
    }
  }

  /**
   * Check if request can afford the given tokens
   * Returns false if tokens would exceed daily limit
   */
  canAfford(tokens: number): boolean {
    if (!this.enabled) return true

    if (Date.now() > this.resetTime) {
      this._resetDaily()
    }

    return this.usedToday + tokens <= this.dailyLimit
  }

  /**
   * Get remaining token headroom
   * Accounts for daily reset if needed
   */
  getHeadroom(): number {
    if (Date.now() > this.resetTime) {
      this._resetDaily()
    }
    return Math.max(0, this.dailyLimit - this.usedToday)
  }

  /**
   * Check if we should throttle new requests (approaching limit)
   * Used to proactively back off before hitting hard limit
   */
  shouldThrottle(): boolean {
    if (!this.enabled) return false
    const headroom = this.getHeadroom()
    return headroom < this.minHeadroom
  }

  /**
   * Get detailed status for monitoring dashboards
   * Returns comprehensive budget and usage information
   */
  getStatus() {
    if (Date.now() > this.resetTime) {
      this._resetDaily()
    }

    const stats = Array.from(this.modelStats.values()).map((s) => ({
      model: s.model,
      totalTokens: s.totalTokens,
      requestCount: s.requestCount,
      avgTokensPerRequest: Math.round(s.avgTokensPerRequest),
      lastUpdated: new Date(s.lastUpdated).toISOString(),
    }))

    return {
      enabled: this.enabled,
      dailyLimit: this.dailyLimit,
      usedToday: this.usedToday,
      headroom: this.getHeadroom(),
      percentUsed: ((this.usedToday / this.dailyLimit) * 100).toFixed(1) + '%',
      shouldThrottle: this.shouldThrottle(),
      resetAt: new Date(this.resetTime).toISOString(),
      modelStats: stats,
      health: this.apiHealth,
    }
  }

  /**
   * Get API health metrics
   * Used for adaptive timeout calculation
   */
  getAPIHealth(): APIHealth {
    return { ...this.apiHealth }
  }

  /**
   * Update API health metrics (called after requests)
   * Tracks average response time and error rate using exponential moving average
   */
  updateAPIHealth(responseTimeMs: number, success: boolean): void {
    // Simple exponential moving average: 70% old, 30% new
    const alpha = 0.3
    this.apiHealth.avgResponseTimeMs =
      alpha * responseTimeMs + (1 - alpha) * this.apiHealth.avgResponseTimeMs

    // Error rate tracking (simplified)
    if (!success) {
      this.apiHealth.errorRate = Math.min(1, this.apiHealth.errorRate + 0.01)
    } else {
      this.apiHealth.errorRate = Math.max(0, this.apiHealth.errorRate - 0.005)
    }

    this.apiHealth.lastChecked = Date.now()
  }

  /**
   * Reset daily budget (called at UTC midnight or when 24h elapsed)
   * Clears counters and updates reset time
   */
  private _resetDaily(): void {
    const oldUsed = this.usedToday
    this.usedToday = 0
    this.resetTime = this._getResetTime()
    this.modelStats.clear()
    this.apiHealth = { avgResponseTimeMs: 0, errorRate: 0, lastChecked: Date.now() }

    console.log(
      `[Token-Budget] Daily reset. Previous day used: ${oldUsed}/${this.dailyLimit} tokens (${((oldUsed / this.dailyLimit) * 100).toFixed(1)}%). Next reset at ${new Date(this.resetTime).toISOString()}`
    )
  }

  /**
   * Calculate next reset time (UTC midnight)
   * Ensures consistent billing cycle regardless of timezone
   */
  private _getResetTime(): number {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    tomorrow.setUTCHours(0, 0, 0, 0)
    return tomorrow.getTime()
  }

  /**
   * Reset budget and stats (for testing)
   * Does NOT reset the singleton instance
   */
  reset(): void {
    this.usedToday = 0
    this.resetTime = this._getResetTime()
    this.modelStats.clear()
    this.apiHealth = { avgResponseTimeMs: 0, errorRate: 0, lastChecked: Date.now() }
    console.log('[Token-Budget] Reset (test mode)')
  }
}
