import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CircuitBreakerMonitor } from '@/lib/circuit-breaker/monitoring'
import { CircuitBreakerRegistry } from '@/lib/circuit-breaker'
import { getCircuitBreakerHealth, getCircuitBreakerEvents } from '@/services/openai-nlp-protected'

/**
 * GET /api/health/circuit-breaker
 *
 * Returns health status of all circuit breakers
 * Useful for dashboards, monitoring systems, and debugging
 *
 * Response includes:
 * - Circuit state (CLOSED, OPEN, HALF_OPEN)
 * - Error rates and failure counts
 * - Recent events
 * - Fallback cache effectiveness
 * - Quality comparison (OpenAI vs fallback)
 *
 * No authentication required (internal endpoint)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const monitor = new CircuitBreakerMonitor(supabase as any, true)

    // Get current health
    const health = getCircuitBreakerHealth()
    const events = getCircuitBreakerEvents(50)

    // Get summary from monitor
    const summary = await monitor.getSummary()

    // Get fallback cache metrics
    const cacheMetrics = await monitor.getFallbackCacheMetrics()

    // Get quality comparison
    const qualityComparison = await monitor.getQualityComparison()

    // Check for alerts
    const alerts = await monitor.checkHealth()

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: health.topicExtraction.healthy && health.themeClustering.healthy ? 'healthy' : 'degraded',

      circuits: {
        topicExtraction: {
          name: 'openai-extract-topics',
          ...health.topicExtraction,
        },
        themeClustering: {
          name: 'openai-cluster-themes',
          ...health.themeClustering,
        },
      },

      // Detailed metrics
      topicExtractionMetrics: health.topicExtraction,
      themeClusteringMetrics: health.themeClustering,

      // Recent events from both circuits
      recentEvents: {
        topicExtraction: events.topicExtraction.slice(-10).map((e) => ({
          timestamp: new Date(e.timestamp).toISOString(),
          type: e.type,
          message: e.message,
        })),
        themeClustering: events.themeClustering.slice(-10).map((e) => ({
          timestamp: new Date(e.timestamp).toISOString(),
          type: e.type,
          message: e.message,
        })),
      },

      // Fallback strategy effectiveness
      fallbackCache: cacheMetrics,

      // Quality metrics
      extractionQuality: qualityComparison,

      // Any alerts triggered
      alerts: alerts.map((a) => ({
        timestamp: a.timestamp.toISOString(),
        level: a.level,
        type: a.type,
        operation: a.operation,
        message: a.message,
        details: a.details,
      })),

      // Summary for quick dashboard view
      summary: {
        totalCircuits: 2,
        openCircuits: [
          health.topicExtraction.state === 'OPEN' ? 'topicExtraction' : null,
          health.themeClustering.state === 'OPEN' ? 'themeClustering' : null,
        ].filter(Boolean),

        averageErrorRate: (
          (health.topicExtraction.errorRate + health.themeClustering.errorRate) / 2
        ).toFixed(3),

        cacheHitRate: cacheMetrics.cacheHitRate.toFixed(3),
        totalCacheItems: cacheMetrics.totalCached,

        mostUsedFallbackCategory: cacheMetrics.mostUsedCategories[0] || null,
      },

      // Operational guidance
      guidance: generateGuidance(health, alerts),
    })
  } catch (error) {
    console.error('[Circuit Breaker Health] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to retrieve circuit breaker status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/health/circuit-breaker/reset
 *
 * Manually reset circuit breaker (for recovery after fixing OpenAI issues)
 * Protected endpoint - requires CRON_SECRET
 */
export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('X-Cron-Secret')
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { resetTopics = true, resetClustering = true } = await request.json().catch(() => ({}))

    const registry = CircuitBreakerRegistry.getAll()

    const result: Record<string, any> = {
      timestamp: new Date().toISOString(),
      reset: [],
    }

    if (resetTopics) {
      const breaker = registry.get('openai-extract-topics')
      if (breaker) {
        breaker.reset()
        result.reset.push({
          operation: 'openai-extract-topics',
          status: 'reset',
          newState: 'CLOSED',
        })
      }
    }

    if (resetClustering) {
      const breaker = registry.get('openai-cluster-themes')
      if (breaker) {
        breaker.reset()
        result.reset.push({
          operation: 'openai-cluster-themes',
          status: 'reset',
          newState: 'CLOSED',
        })
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Circuit Breaker Reset] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to reset circuit breaker',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/health/circuit-breaker/metrics.prom
 *
 * Prometheus format metrics export
 * For integration with Prometheus, Grafana, etc.
 */
export async function GET_METRICS(request: NextRequest) {
  if (!request.url.includes('metrics.prom')) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const monitor = new CircuitBreakerMonitor(supabase as any, false)
    const prometheusMetrics = await monitor.exportMetrics()

    return new NextResponse(prometheusMetrics, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[Circuit Breaker Metrics] Error:', error)
    return new NextResponse('Error generating metrics', { status: 500 })
  }
}

/**
 * Generate operational guidance based on circuit state
 */
function generateGuidance(
  health: ReturnType<typeof getCircuitBreakerHealth>,
  alerts: any[]
): string[] {
  const guidance: string[] = []

  // Topic extraction guidance
  if (health.topicExtraction.state === 'OPEN') {
    guidance.push(
      '⚠️ Topic extraction circuit is OPEN - using fallback extraction (lower quality)'
    )
    guidance.push(
      'Action: Check OpenAI API status and error logs. Circuit will auto-recover in 60 seconds.'
    )
  } else if (health.topicExtraction.state === 'HALF_OPEN') {
    guidance.push('🔄 Topic extraction circuit is testing recovery...')
  } else if (health.topicExtraction.errorRate > 0.5) {
    guidance.push('⚠️ Topic extraction error rate is high (>' + (health.topicExtraction.errorRate * 100).toFixed(1) + '%)')
    guidance.push('Action: Monitor closely - circuit may open soon if errors continue')
  }

  // Theme clustering guidance
  if (health.themeClustering.state === 'OPEN') {
    guidance.push(
      '⚠️ Theme clustering circuit is OPEN - returning unclustered results'
    )
  } else if (health.themeClustering.state === 'HALF_OPEN') {
    guidance.push('🔄 Theme clustering circuit is testing recovery...')
  }

  // General health
  if (
    health.topicExtraction.state === 'CLOSED' &&
    health.themeClustering.state === 'CLOSED'
  ) {
    guidance.push('✅ All circuits healthy - OpenAI API operating normally')
  }

  // Cache guidance
  if (
    (health.topicExtraction.state !== 'CLOSED' ||
      health.themeClustering.state !== 'CLOSED') &&
    guidance.length < 5
  ) {
    guidance.push(
      '📦 Using fallback cache for topic extraction (may have slightly lower confidence)'
    )
  }

  return guidance
}
