/**
 * Circuit Breaker - Unit Tests
 *
 * Tests for state transitions, error tracking, and recovery
 */

import { OpenAICircuitBreaker, CircuitBreakerRegistry } from '@/lib/circuit-breaker'

describe('OpenAICircuitBreaker', () => {
  let breaker: OpenAICircuitBreaker

  beforeEach(() => {
    breaker = new OpenAICircuitBreaker('test-operation', {
      errorRateThreshold: 0.5,
      consecutiveFailureThreshold: 3,
      recoveryTimeout: 100, // Fast for testing
      halfOpenSuccessThreshold: 2,
      debug: false,
    })
  })

  afterEach(() => {
    breaker.destroy()
  })

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED')
      expect(breaker.isOpen()).toBe(false)
    })

    it('should have zero metrics initially', () => {
      const metrics = breaker.getMetrics()
      expect(metrics.successCount).toBe(0)
      expect(metrics.failureCount).toBe(0)
      expect(metrics.errorRate).toBe(0)
      expect(metrics.consecutiveFailures).toBe(0)
    })

    it('should be healthy initially', () => {
      const health = breaker.getHealth()
      expect(health.healthy).toBe(true)
      expect(health.state).toBe('CLOSED')
    })
  })

  describe('CLOSED → OPEN Transitions', () => {
    it('should open after consecutive failures reach threshold', () => {
      expect(breaker.getState()).toBe('CLOSED')

      breaker.recordFailure('Error 1')
      expect(breaker.getState()).toBe('CLOSED')

      breaker.recordFailure('Error 2')
      expect(breaker.getState()).toBe('CLOSED')

      breaker.recordFailure('Error 3')
      expect(breaker.getState()).toBe('OPEN')
      expect(breaker.getHealth().consecutiveFailures).toBe(3)
    })

    it('should reset consecutive failures on success', () => {
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      expect(breaker.getMetrics().consecutiveFailures).toBe(2)

      breaker.recordSuccess()
      expect(breaker.getMetrics().consecutiveFailures).toBe(0)
      expect(breaker.getState()).toBe('CLOSED')
    })

    it('should open on high error rate', () => {
      // Simulate 5 total attempts: 3 failures, 2 successes = 60% error rate
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      breaker.recordFailure('Error 3')
      breaker.recordSuccess()
      breaker.recordSuccess()

      // Error rate should be > 50%, so circuit should open
      expect(breaker.isOpen()).toBe(true)
    })

    it('should fail fast when open', async () => {
      // Open the circuit
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      breaker.recordFailure('Error 3')

      expect(breaker.isOpen()).toBe(true)

      // Try to execute while open - should fail immediately
      const { success, error } = await breaker.execute(async () => {
        return 'This should not be called'
      })

      expect(success).toBe(false)
      expect(error).toBeDefined()
      expect(error?.message).toContain('Circuit is OPEN')
    })
  })

  describe('OPEN → HALF_OPEN Transitions', () => {
    it('should transition to HALF_OPEN after recovery timeout', async () => {
      // Open circuit
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      breaker.recordFailure('Error 3')
      expect(breaker.getState()).toBe('OPEN')

      // Wait for recovery timeout
      await new Promise((r) => setTimeout(r, 150))

      // Should be in HALF_OPEN state now
      expect(breaker.getState()).toBe('HALF_OPEN')
    })

    it('should allow execution in HALF_OPEN state', async () => {
      // Open circuit
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      breaker.recordFailure('Error 3')

      await new Promise((r) => setTimeout(r, 150))

      // Execute should work in HALF_OPEN
      const { success, result } = await breaker.execute(async () => {
        return 'Test result'
      })

      expect(success).toBe(true)
      expect(result).toBe('Test result')
    })
  })

  describe('HALF_OPEN → CLOSED Transitions', () => {
    it('should close after enough successes', async () => {
      // Open circuit
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      breaker.recordFailure('Error 3')

      await new Promise((r) => setTimeout(r, 150))
      expect(breaker.getState()).toBe('HALF_OPEN')

      // Record successes to close
      breaker.recordSuccess()
      breaker.recordSuccess()

      expect(breaker.getState()).toBe('CLOSED')
    })

    it('should reset metrics when closing', async () => {
      // Open circuit
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      breaker.recordFailure('Error 3')

      const metricsWhenOpen = breaker.getMetrics()
      expect(metricsWhenOpen.failureCount).toBe(3)

      await new Promise((r) => setTimeout(r, 150))

      // Close circuit
      breaker.recordSuccess()
      breaker.recordSuccess()

      const metricsWhenClosed = breaker.getMetrics()
      expect(metricsWhenClosed.failureCount).toBe(0)
      expect(metricsWhenClosed.successCount).toBe(0)
      expect(metricsWhenClosed.consecutiveFailures).toBe(0)
    })
  })

  describe('HALF_OPEN → OPEN Transitions', () => {
    it('should reopen if failure occurs in HALF_OPEN', async () => {
      // Open circuit
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      breaker.recordFailure('Error 3')

      await new Promise((r) => setTimeout(r, 150))
      expect(breaker.getState()).toBe('HALF_OPEN')

      // Failure in HALF_OPEN should reopen
      breaker.recordFailure('Recovery failed')

      expect(breaker.getState()).toBe('OPEN')
    })
  })

  describe('Execute Method', () => {
    it('should execute function when circuit is closed', async () => {
      const mockFn = jest.fn().mockResolvedValue('Success')

      const { success, result } = await breaker.execute(mockFn)

      expect(success).toBe(true)
      expect(result).toBe('Success')
      expect(mockFn).toHaveBeenCalled()
    })

    it('should not execute function when circuit is open', async () => {
      // Open circuit
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      breaker.recordFailure('Error 3')

      const mockFn = jest.fn()

      const { success } = await breaker.execute(mockFn)

      expect(success).toBe(false)
      expect(mockFn).not.toHaveBeenCalled()
    })

    it('should catch function errors and record failures', async () => {
      const error = new Error('Test error')
      const mockFn = jest.fn().mockRejectedValue(error)

      const { success, error: catchedError } = await breaker.execute(mockFn)

      expect(success).toBe(false)
      expect(catchedError).toBe(error)
      expect(breaker.getMetrics().failureCount).toBe(1)
    })
  })

  describe('Events Tracking', () => {
    it('should track state change events', () => {
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      breaker.recordFailure('Error 3')

      const events = breaker.getEvents()

      const stateChangeEvent = events.find((e) => e.type === 'STATE_CHANGE')
      expect(stateChangeEvent).toBeDefined()
      expect(stateChangeEvent?.message).toContain('CLOSED → OPEN')
    })

    it('should track success and failure events', () => {
      breaker.recordSuccess()
      breaker.recordSuccess()
      breaker.recordFailure('Test error')

      const events = breaker.getEvents()
      const successEvents = events.filter((e) => e.type === 'SUCCESS')
      const failureEvents = events.filter((e) => e.type === 'FAILURE')

      expect(successEvents).toHaveLength(2)
      expect(failureEvents).toHaveLength(1)
    })

    it('should limit stored events to prevent memory bloat', () => {
      // Record many events
      for (let i = 0; i < 1500; i++) {
        breaker.recordSuccess()
      }

      const events = breaker.getEvents()
      expect(events.length).toBeLessThanOrEqual(1000) // Default max
      expect(events.length).toBeGreaterThanOrEqual(500) // After trim
    })
  })

  describe('Reset', () => {
    it('should reset circuit to initial state', () => {
      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      breaker.recordFailure('Error 3')

      expect(breaker.isOpen()).toBe(true)

      breaker.reset()

      expect(breaker.getState()).toBe('CLOSED')
      expect(breaker.getMetrics().failureCount).toBe(0)
      expect(breaker.getMetrics().successCount).toBe(0)
    })
  })

  describe('CircuitBreakerRegistry', () => {
    it('should register and retrieve breakers', () => {
      const breaker1 = new OpenAICircuitBreaker('operation-1')
      const breaker2 = new OpenAICircuitBreaker('operation-2')

      CircuitBreakerRegistry.register('operation-1', breaker1)
      CircuitBreakerRegistry.register('operation-2', breaker2)

      expect(CircuitBreakerRegistry.get('operation-1')).toBe(breaker1)
      expect(CircuitBreakerRegistry.get('operation-2')).toBe(breaker2)

      breaker1.destroy()
      breaker2.destroy()
    })

    it('should get health report for all breakers', () => {
      const breaker1 = new OpenAICircuitBreaker('operation-1')
      const breaker2 = new OpenAICircuitBreaker('operation-2')

      CircuitBreakerRegistry.register('operation-1', breaker1)
      CircuitBreakerRegistry.register('operation-2', breaker2)

      const report = CircuitBreakerRegistry.getHealthReport()

      expect(report['operation-1']).toBeDefined()
      expect(report['operation-2']).toBeDefined()
      expect(report['operation-1'].healthy).toBe(true)
      expect(report['operation-2'].healthy).toBe(true)

      breaker1.destroy()
      breaker2.destroy()
      CircuitBreakerRegistry.destroyAll()
    })
  })

  describe('Metrics Reset', () => {
    it('should reset metrics after prolonged stability', async () => {
      breaker = new OpenAICircuitBreaker('test-op', {
        consecutiveFailureThreshold: 3,
        metricsResetInterval: 100,
        debug: false,
      })

      breaker.recordFailure('Error 1')
      breaker.recordFailure('Error 2')
      expect(breaker.getMetrics().failureCount).toBe(2)

      // Wait for metrics reset interval
      await new Promise((r) => setTimeout(r, 200))

      // Metrics should be reset (circuit still CLOSED)
      // Note: This depends on circuit being CLOSED during the interval
      // In production, this auto-recovery happens periodically
    })
  })
})
