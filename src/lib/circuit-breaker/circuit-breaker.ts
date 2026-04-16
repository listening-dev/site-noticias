import {
  CircuitBreakerState,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
  CircuitBreakerEvent,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './types'

/**
 * Circuit Breaker - Protects against cascading failures
 *
 * Implements the Circuit Breaker pattern with three states:
 * CLOSED → OPEN → HALF_OPEN → CLOSED
 *
 * State Transitions:
 * - CLOSED → OPEN: When error rate exceeds threshold OR consecutive failures exceed threshold
 * - OPEN → HALF_OPEN: After recovery timeout has passed
 * - HALF_OPEN → CLOSED: When enough successes occur
 * - HALF_OPEN → OPEN: When a failure occurs
 */
export class OpenAICircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED'
  private config: CircuitBreakerConfig
  private metrics: CircuitBreakerMetrics
  private lastStateChangeTime: number = Date.now()
  private events: CircuitBreakerEvent[] = []
  private metricsResetTimer: NodeJS.Timeout | null = null
  private halfOpenAttempts: number = 0

  // Performance tracking for HALF_OPEN state
  private requestQueue: Array<{
    timestamp: number
    success: boolean
  }> = []

  constructor(
    private operationName: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config }
    this.metrics = {
      successCount: 0,
      failureCount: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      totalAttempts: 0,
      errorRate: 0,
      consecutiveFailures: 0,
      stateChangeTime: Date.now(),
    }

    // Reset metrics periodically
    this.startMetricsResetTimer()
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitBreakerState {
    if (this.state === 'OPEN') {
      const timeSinceOpen = Date.now() - this.lastStateChangeTime
      if (timeSinceOpen >= this.config.recoveryTimeout) {
        this.transitionTo('HALF_OPEN')
      }
    }
    return this.state
  }

  /**
   * Check if circuit is open (fail-fast)
   */
  isOpen(): boolean {
    return this.getState() === 'OPEN'
  }

  /**
   * Execute function with circuit breaker protection
   * Returns: { success: boolean, result?: T, error?: Error }
   */
  async execute<T>(fn: () => Promise<T>): Promise<{ success: boolean; result?: T; error?: Error }> {
    const currentState = this.getState()

    if (currentState === 'OPEN') {
      const error = new Error(`[${this.operationName}] Circuit is OPEN - fail fast`)
      this.recordEvent('FAILURE', error.message)
      return { success: false, error }
    }

    try {
      const result = await fn()
      this.recordSuccess()
      return { success: true, result }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.recordFailure(errorMessage)
      return { success: false, error: error instanceof Error ? error : new Error(errorMessage) }
    }
  }

  /**
   * Record a successful API call
   */
  recordSuccess(): void {
    this.metrics.successCount++
    this.metrics.consecutiveFailures = 0
    this.metrics.lastSuccessTime = Date.now()
    this.metrics.totalAttempts++

    this.updateErrorRate()
    this.recordEvent('SUCCESS', 'API call succeeded')

    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++

      if (this.halfOpenAttempts >= this.config.halfOpenSuccessThreshold) {
        this.transitionTo('CLOSED')
        this.metrics.successCount = 0
        this.metrics.failureCount = 0
        this.halfOpenAttempts = 0
      }
    }
  }

  /**
   * Record a failed API call
   */
  recordFailure(errorMessage: string): void {
    this.metrics.failureCount++
    this.metrics.consecutiveFailures++
    this.metrics.lastFailureTime = Date.now()
    this.metrics.totalAttempts++

    this.updateErrorRate()
    this.recordEvent('FAILURE', `API call failed: ${errorMessage}`)

    // Check if should open circuit
    if (this.state === 'CLOSED' || this.state === 'HALF_OPEN') {
      const shouldOpen =
        this.metrics.consecutiveFailures >= this.config.consecutiveFailureThreshold ||
        this.metrics.errorRate >= this.config.errorRateThreshold

      if (shouldOpen) {
        this.transitionTo('OPEN')
      }
    }

    if (this.state === 'HALF_OPEN') {
      // Failure in HALF_OPEN state goes back to OPEN
      this.transitionTo('OPEN')
      this.halfOpenAttempts = 0
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics }
  }

  /**
   * Get health status for monitoring/dashboards
   */
  getHealth(): {
    state: CircuitBreakerState
    healthy: boolean
    errorRate: number
    consecutiveFailures: number
    lastFailureTime: Date | null
    successCount: number
    failureCount: number
  } {
    return {
      state: this.getState(),
      healthy: this.getState() === 'CLOSED',
      errorRate: this.metrics.errorRate,
      consecutiveFailures: this.metrics.consecutiveFailures,
      lastFailureTime: this.metrics.lastFailureTime ? new Date(this.metrics.lastFailureTime) : null,
      successCount: this.metrics.successCount,
      failureCount: this.metrics.failureCount,
    }
  }

  /**
   * Get recent events for logging/debugging
   */
  getEvents(limit: number = 50): CircuitBreakerEvent[] {
    return this.events.slice(-limit)
  }

  /**
   * Reset circuit manually (for testing/recovery)
   */
  reset(): void {
    this.metrics = {
      successCount: 0,
      failureCount: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      totalAttempts: 0,
      errorRate: 0,
      consecutiveFailures: 0,
      stateChangeTime: Date.now(),
    }
    this.halfOpenAttempts = 0
    this.requestQueue = []
    this.transitionTo('CLOSED')
    this.recordEvent('STATE_CHANGE', 'Circuit manually reset')
  }

  /**
   * Destroy circuit breaker (cleanup)
   */
  destroy(): void {
    if (this.metricsResetTimer) {
      clearInterval(this.metricsResetTimer)
    }
  }

  // ==================== Private Methods ====================

  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state === newState) return

    const oldState = this.state
    this.state = newState
    this.lastStateChangeTime = Date.now()
    this.metrics.stateChangeTime = Date.now()

    const message = `State transition: ${oldState} → ${newState}`
    this.recordEvent('STATE_CHANGE', message)

    if (this.config.debug) {
      console.log(`[${this.operationName}] ${message}`, {
        errorRate: this.metrics.errorRate.toFixed(2),
        consecutiveFailures: this.metrics.consecutiveFailures,
        totalAttempts: this.metrics.totalAttempts,
      })
    }
  }

  private updateErrorRate(): void {
    const total = this.metrics.totalAttempts
    if (total === 0) {
      this.metrics.errorRate = 0
      return
    }

    const recentRequests = this.requestQueue.slice(-this.config.metricsWindow)
    const recentFailures = recentRequests.filter((r) => !r.success).length

    this.metrics.errorRate = recentFailures / recentRequests.length
    this.requestQueue.push({
      timestamp: Date.now(),
      success: this.metrics.failureCount < this.metrics.totalAttempts,
    })

    // Trim request queue to metricsWindow size
    if (this.requestQueue.length > this.config.metricsWindow) {
      this.requestQueue = this.requestQueue.slice(-this.config.metricsWindow)
    }
  }

  private recordEvent(type: 'STATE_CHANGE' | 'SUCCESS' | 'FAILURE' | 'HALF_OPEN_ATTEMPT', message: string): void {
    this.events.push({
      timestamp: Date.now(),
      type,
      state: this.state,
      message,
      metrics: { ...this.metrics },
    })

    // Keep only recent events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-500)
    }
  }

  private startMetricsResetTimer(): void {
    this.metricsResetTimer = setInterval(() => {
      if (this.state === 'CLOSED' && Date.now() - this.metrics.stateChangeTime > this.config.metricsResetInterval) {
        // Reset metrics if in CLOSED state and interval has passed
        // This allows old failures to be forgotten
        const resetMetrics = { ...this.metrics }
        resetMetrics.successCount = 0
        resetMetrics.failureCount = 0
        resetMetrics.totalAttempts = 0
        resetMetrics.consecutiveFailures = 0
        resetMetrics.errorRate = 0
        this.requestQueue = []

        if (this.config.debug) {
          console.log(`[${this.operationName}] Metrics reset after ${this.config.metricsResetInterval}ms of stability`)
        }
      }
    }, this.config.metricsResetInterval)
  }
}

/**
 * Global registry of circuit breakers by operation name
 * Useful for monitoring all circuit breakers in the system
 */
export class CircuitBreakerRegistry {
  private static breakers: Map<string, OpenAICircuitBreaker> = new Map()

  static register(operationName: string, breaker: OpenAICircuitBreaker): void {
    this.breakers.set(operationName, breaker)
  }

  static get(operationName: string): OpenAICircuitBreaker | undefined {
    return this.breakers.get(operationName)
  }

  static getAll(): Map<string, OpenAICircuitBreaker> {
    return new Map(this.breakers)
  }

  static getHealthReport(): Record<string, ReturnType<OpenAICircuitBreaker['getHealth']>> {
    const report: Record<string, ReturnType<OpenAICircuitBreaker['getHealth']>> = {}
    for (const [name, breaker] of this.breakers.entries()) {
      report[name] = breaker.getHealth()
    }
    return report
  }

  static destroyAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.destroy()
    }
    this.breakers.clear()
  }
}
