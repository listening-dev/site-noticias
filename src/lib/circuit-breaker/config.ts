/**
 * Circuit Breaker Configuration
 * Loads from environment variables with sensible defaults
 */

export const circuitBreakerConfig = {
  // Error threshold that triggers OPEN state (0-1)
  ERROR_RATE_THRESHOLD: parseFloat(process.env.OPENAI_ERROR_THRESHOLD || '0.5'),

  // Number of consecutive failures before opening circuit
  CONSECUTIVE_FAILURES: parseInt(process.env.OPENAI_CONSECUTIVE_FAILURES || '3'),

  // Time before attempting recovery (milliseconds)
  RECOVERY_TIMEOUT: parseInt(process.env.OPENAI_RECOVERY_TIMEOUT || '60000'), // 1 minute

  // Number of successful calls in HALF_OPEN to transition to CLOSED
  HALF_OPEN_SUCCESS_THRESHOLD: parseInt(process.env.OPENAI_HALF_OPEN_ATTEMPTS || '2'),

  // Window of recent calls to track for error rate
  METRICS_WINDOW: parseInt(process.env.OPENAI_METRICS_WINDOW || '100'),

  // Time to keep metrics before reset (milliseconds)
  METRICS_RESET_INTERVAL: parseInt(process.env.OPENAI_METRICS_RESET_INTERVAL || '300000'), // 5 minutes

  // Enable detailed logging
  DEBUG: process.env.OPENAI_CIRCUIT_DEBUG !== 'false',

  // Fallback cache settings
  USE_FALLBACK_CACHE: process.env.OPENAI_USE_FALLBACK_CACHE !== 'false',
  FALLBACK_USE_RULES: process.env.OPENAI_FALLBACK_USE_RULES !== 'false',

  // Health check settings
  HEALTH_CHECK_INTERVAL: parseInt(process.env.OPENAI_HEALTH_CHECK_INTERVAL || '300000'), // 5 minutes
  LOG_HEALTH_METRICS: process.env.OPENAI_LOG_HEALTH_METRICS !== 'false',

  // Alert thresholds
  ALERT_ERROR_RATE: parseFloat(process.env.OPENAI_ALERT_ERROR_RATE || '0.7'),
  ALERT_CIRCUIT_OPEN: process.env.OPENAI_ALERT_CIRCUIT_OPEN !== 'false',
}

export const getConfigSummary = () => {
  return `
OpenAI Circuit Breaker Configuration:
=====================================
Error Rate Threshold:         ${(circuitBreakerConfig.ERROR_RATE_THRESHOLD * 100).toFixed(0)}%
Consecutive Failures Limit:   ${circuitBreakerConfig.CONSECUTIVE_FAILURES}
Recovery Timeout:             ${circuitBreakerConfig.RECOVERY_TIMEOUT}ms
Half-Open Success Threshold:  ${circuitBreakerConfig.HALF_OPEN_SUCCESS_THRESHOLD}
Metrics Window:               ${circuitBreakerConfig.METRICS_WINDOW}
Use Fallback Cache:           ${circuitBreakerConfig.USE_FALLBACK_CACHE}
Use Fallback Rules:           ${circuitBreakerConfig.FALLBACK_USE_RULES}
Debug Logging:                ${circuitBreakerConfig.DEBUG}
  `.trim()
}
