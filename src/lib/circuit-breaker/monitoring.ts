/**
 * Circuit Breaker Monitoring & Health Tracking
 *
 * Tracks:
 * - Circuit state changes
 * - Error rates over time
 * - Recovery metrics
 * - Fallback effectiveness
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'
import { CircuitBreakerRegistry } from './circuit-breaker'

type AppSupabaseClient = SupabaseClient<Database>

export interface CircuitBreakerAlert {
  level: 'warning' | 'critical'
  type: 'error_rate_high' | 'circuit_open' | 'recovery_attempt' | 'recovered'
  operation: string
  message: string
  details: Record<string, any>
  timestamp: Date
}

export class CircuitBreakerMonitor {
  private alerts: CircuitBreakerAlert[] = []
  private lastStates: Map<string, string> = new Map()

  constructor(
    private supabase: AppSupabaseClient,
    private debugLogging: boolean = true
  ) {}

  /**
   * Check health of all circuit breakers and log state changes
   * Call this periodically (e.g., every 5 minutes) from a cron job
   */
  async checkHealth(): Promise<CircuitBreakerAlert[]> {
    const breakers = CircuitBreakerRegistry.getAll()
    const newAlerts: CircuitBreakerAlert[] = []

    for (const [operationName, breaker] of breakers.entries()) {
      const health = breaker.getHealth()
      const lastState = this.lastStates.get(operationName)

      // Log state change
      if (lastState && lastState !== health.state) {
        const alert: CircuitBreakerAlert = {
          level: health.state === 'OPEN' ? 'critical' : 'warning',
          type:
            health.state === 'OPEN'
              ? 'circuit_open'
              : health.state === 'HALF_OPEN'
                ? 'recovery_attempt'
                : 'recovered',
          operation: operationName,
          message: `Circuit state: ${lastState} → ${health.state}`,
          details: {
            errorRate: health.errorRate,
            consecutiveFailures: health.consecutiveFailures,
            successCount: health.successCount,
            failureCount: health.failureCount,
          },
          timestamp: new Date(),
        }
        newAlerts.push(alert)

        if (this.debugLogging) {
          console.log(`[CircuitBreakerMonitor] ${alert.message}`, alert.details)
        }
      }

      // Check for high error rate
      if (health.errorRate >= 0.7 && health.state === 'CLOSED') {
        const alert: CircuitBreakerAlert = {
          level: 'warning',
          type: 'error_rate_high',
          operation: operationName,
          message: `High error rate: ${(health.errorRate * 100).toFixed(1)}%`,
          details: {
            errorRate: health.errorRate,
            failureCount: health.failureCount,
          },
          timestamp: new Date(),
        }
        newAlerts.push(alert)
      }

      this.lastStates.set(operationName, health.state)
    }

    // Save to database
    if (newAlerts.length > 0) {
      await this.logAlerts(newAlerts)
    }

    return newAlerts
  }

  /**
   * Log circuit breaker health metrics to database
   */
  async logHealthMetrics(): Promise<void> {
    const breakers = CircuitBreakerRegistry.getAll()

    for (const [operationName, breaker] of breakers.entries()) {
      const health = breaker.getHealth()
      const metrics = breaker.getMetrics()

      try {
        await this.supabase
          .schema('noticias')
          .from('circuit_breaker_health_log')
          .insert({
            operation_name: operationName,
            state: health.state,
            error_rate: health.errorRate,
            consecutive_failures: health.consecutiveFailures,
            total_attempts: metrics.totalAttempts,
            success_count: metrics.successCount,
            failure_count: metrics.failureCount,
            last_failure_reason: 'See application logs',
            time_in_state: Date.now() - metrics.stateChangeTime,
          })
      } catch (error) {
        console.error(`[CircuitBreakerMonitor] Failed to log metrics for ${operationName}:`, error)
      }
    }
  }

  /**
   * Get summary of all circuit breaker statuses
   * Useful for dashboards
   */
  async getSummary(): Promise<Record<string, any>> {
    const breakers = CircuitBreakerRegistry.getAll()
    const summary: Record<string, any> = {
      timestamp: new Date().toISOString(),
      totalBreakers: breakers.size,
      breakers: {},
      alerts: this.alerts.slice(-50), // Last 50 alerts
    }

    for (const [operationName, breaker] of breakers.entries()) {
      const health = breaker.getHealth()
      const events = breaker.getEvents(5)

      summary.breakers[operationName] = {
        state: health.state,
        healthy: health.healthy,
        errorRate: (health.errorRate * 100).toFixed(1) + '%',
        consecutiveFailures: health.consecutiveFailures,
        successCount: health.successCount,
        failureCount: health.failureCount,
        lastFailure: health.lastFailureTime?.toISOString() || null,
        recentEvents: events.map((e) => ({
          timestamp: new Date(e.timestamp).toISOString(),
          type: e.type,
          message: e.message,
        })),
      }
    }

    return summary
  }

  /**
   * Export metrics for external monitoring systems (Prometheus, Datadog, etc)
   */
  async exportMetrics(): Promise<string> {
    const breakers = CircuitBreakerRegistry.getAll()
    const lines: string[] = []

    // Prometheus format
    lines.push('# HELP openai_circuit_breaker_state Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)')
    lines.push('# TYPE openai_circuit_breaker_state gauge')

    for (const [operationName, breaker] of breakers.entries()) {
      const health = breaker.getHealth()
      const stateValue = health.state === 'CLOSED' ? 0 : health.state === 'OPEN' ? 1 : 2

      lines.push(
        `openai_circuit_breaker_state{operation="${operationName}"} ${stateValue}`
      )
    }

    lines.push('')
    lines.push('# HELP openai_circuit_breaker_error_rate Error rate (0-1)')
    lines.push('# TYPE openai_circuit_breaker_error_rate gauge')

    for (const [operationName, breaker] of breakers.entries()) {
      const health = breaker.getHealth()
      lines.push(`openai_circuit_breaker_error_rate{operation="${operationName}"} ${health.errorRate}`)
    }

    lines.push('')
    lines.push('# HELP openai_circuit_breaker_failures Total failures')
    lines.push('# TYPE openai_circuit_breaker_failures counter')

    for (const [operationName, breaker] of breakers.entries()) {
      const health = breaker.getHealth()
      lines.push(`openai_circuit_breaker_failures_total{operation="${operationName}"} ${health.failureCount}`)
    }

    return lines.join('\n')
  }

  /**
   * Get fallback cache effectiveness metrics
   */
  async getFallbackCacheMetrics(): Promise<{
    totalCached: number
    cacheHitRate: number
    mostUsedCategories: Array<{ category: string; count: number }>
  }> {
    try {
      const { data, error } = await this.supabase
        .schema('noticias')
        .from('fallback_extraction_cache')
        .select(
          `
          id,
          hit_count,
          extracted_data
        `
        )
        .eq('status', 'active')

      if (error || !data) {
        return {
          totalCached: 0,
          cacheHitRate: 0,
          mostUsedCategories: [],
        }
      }

      const totalCached = data.length
      const cacheHits = data.filter((item) => (item.hit_count || 0) > 0).length
      const cacheHitRate = totalCached > 0 ? cacheHits / totalCached : 0

      // Get most used categories
      const categoryCount = new Map<string, number>()
      for (const item of data) {
        const extracted = item.extracted_data as any
        if (extracted?.category && (item.hit_count || 0) > 0) {
          categoryCount.set(
            extracted.category,
            (categoryCount.get(extracted.category) || 0) + (item.hit_count || 0)
          )
        }
      }

      const mostUsedCategories = Array.from(categoryCount.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      return {
        totalCached,
        cacheHitRate,
        mostUsedCategories,
      }
    } catch (error) {
      console.error('[CircuitBreakerMonitor] Error getting cache metrics:', error)
      return {
        totalCached: 0,
        cacheHitRate: 0,
        mostUsedCategories: [],
      }
    }
  }

  /**
   * Get extraction quality comparison (OpenAI vs fallback)
   */
  async getQualityComparison(): Promise<Record<string, any>> {
    try {
      const { data, error } = await this.supabase
        .schema('noticias')
        .from('extraction_quality_metrics')
        .select('extraction_source, extraction_confidence')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

      if (error || !data) {
        return {}
      }

      const sourceMetrics: Record<string, { count: number; avgConfidence: number }> = {}

      for (const item of data) {
        const source = item.extraction_source
        if (!sourceMetrics[source]) {
          sourceMetrics[source] = { count: 0, avgConfidence: 0 }
        }
        sourceMetrics[source].count++
        sourceMetrics[source].avgConfidence += item.extraction_confidence
      }

      // Calculate averages
      const result: Record<string, any> = {}
      for (const [source, metrics] of Object.entries(sourceMetrics)) {
        result[source] = {
          count: metrics.count,
          avgConfidence: metrics.avgConfidence / metrics.count,
        }
      }

      return result
    } catch (error) {
      console.error('[CircuitBreakerMonitor] Error getting quality comparison:', error)
      return {}
    }
  }

  /**
   * Private method: Log alerts to database
   */
  private async logAlerts(alerts: CircuitBreakerAlert[]): Promise<void> {
    this.alerts.push(...alerts)

    try {
      for (const alert of alerts) {
        await this.supabase.schema('noticias').from('circuit_breaker_health_log').insert({
          operation_name: alert.operation,
          state: 'OPEN', // Alert only logged for state changes
          timestamp: alert.timestamp.toISOString(),
          last_failure_reason: alert.message,
        })
      }
    } catch (error) {
      console.error('[CircuitBreakerMonitor] Failed to log alerts:', error)
    }
  }
}
