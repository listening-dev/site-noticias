/**
 * Circuit Breaker Pattern - Type Definitions
 *
 * States:
 * - CLOSED: Normal operation, calls go through to API
 * - OPEN: API failures detected, fail-fast without calling API
 * - HALF_OPEN: Testing if API has recovered, limited calls allowed
 */

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerMetrics {
  successCount: number
  failureCount: number
  lastFailureTime: number | null
  lastSuccessTime: number | null
  totalAttempts: number
  errorRate: number // 0-1
  consecutiveFailures: number
  stateChangeTime: number
}

export interface CircuitBreakerConfig {
  /**
   * Error rate threshold (0-1) that triggers OPEN state
   * Default: 0.5 (50% error rate)
   */
  errorRateThreshold: number

  /**
   * Number of consecutive failures to trigger OPEN state
   * Default: 3
   */
  consecutiveFailureThreshold: number

  /**
   * Time in milliseconds before transitioning from OPEN to HALF_OPEN
   * Default: 60000 (60 seconds)
   */
  recoveryTimeout: number

  /**
   * Number of successful requests in HALF_OPEN state to transition to CLOSED
   * Default: 2
   */
  halfOpenSuccessThreshold: number

  /**
   * Maximum number of requests to track for error rate calculation
   * Default: 100
   */
  metricsWindow: number

  /**
   * Time in milliseconds to reset metrics
   * Default: 300000 (5 minutes)
   */
  metricsResetInterval: number

  /**
   * Enable detailed logging
   * Default: true
   */
  debug: boolean
}

export interface CircuitBreakerEvent {
  timestamp: number
  type: 'STATE_CHANGE' | 'SUCCESS' | 'FAILURE' | 'HALF_OPEN_ATTEMPT'
  state: CircuitBreakerState
  message: string
  metrics?: CircuitBreakerMetrics
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  errorRateThreshold: 0.5,
  consecutiveFailureThreshold: 3,
  recoveryTimeout: 60000,
  halfOpenSuccessThreshold: 2,
  metricsWindow: 100,
  metricsResetInterval: 300000,
  debug: true,
}
