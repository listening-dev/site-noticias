import { SupabaseClient } from '@supabase/supabase-js'
import {
  extractTopicsWithErrorTracking,
  clusterThemesWithErrorTracking,
  ExtractedTopics,
} from '@/lib/openai-nlp-tracked'
import { OpenAIErrorLogger, type DetailedError } from '@/lib/openai-error-handler'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

/**
 * Enhanced result with error tracking and quality metrics
 */
export interface TopicProcessResult {
  news_id: string
  success: boolean
  error?: DetailedError
  quality: {
    errorType?: string
    severity?: string
    attemptedRetry: boolean
  }
}

/**
 * Batch processing result with detailed error breakdown
 */
export interface BatchProcessResult {
  total: number
  successful: number
  failed: number
  results: TopicProcessResult[]
  errorsByType: Record<string, number>
  successRate: string
}

/**
 * Process a single news item, extracting topics and saving to database
 * Returns structured result so caller can decide whether to accept or retry
 *
 * @param supabase - Supabase client
 * @param newsId - ID of the news item
 * @param title - News title
 * @param description - News description
 * @returns Detailed result with error info and quality metrics
 */
export async function processNewsTopicV2(
  supabase: AppSupabaseClient,
  newsId: string,
  title: string,
  description: string | null | undefined
): Promise<TopicProcessResult> {
  try {
    // 1. Extract topics with error tracking
    const trackedResult = await extractTopicsWithErrorTracking(title, description)

    if (!trackedResult.success) {
      // OpenAI failed - log error and return failure
      const detailedError = trackedResult.error!
      OpenAIErrorLogger.log(detailedError, {
        newsId,
        batchSize: 1,
        failureCount: 1,
        successCount: 0,
      })

      return {
        news_id: newsId,
        success: false,
        error: detailedError,
        quality: {
          errorType: detailedError.type,
          severity: detailedError.severity,
          attemptedRetry: detailedError.canRetry,
        },
      }
    }

    const extracted = trackedResult.data!

    // 2. Save to database
    const { error: dbError } = await supabase
      .schema('noticias')
      .from('news_topics')
      .upsert(
        {
          news_id: newsId,
          topics: extracted.topics,
          entities: extracted.entities,
          sentiment: extracted.sentiment,
          category: extracted.category,
        },
        { onConflict: 'news_id' }
      )

    if (dbError) {
      // Database error - this is fatal and not retryable
      const dbErrorDetail: DetailedError = {
        type: 'APIError',
        message: `Failed to save topics to database: ${dbError.message}`,
        canRetry: true, // Database errors might be transient
        severity: 'degraded',
        originalError: new Error(dbError.message),
        context: {
          model: 'gpt-4o-mini',
          timestamp: new Date().toISOString(),
        },
      }

      return {
        news_id: newsId,
        success: false,
        error: dbErrorDetail,
        quality: {
          errorType: 'APIError',
          severity: 'degraded',
          attemptedRetry: true,
        },
      }
    }

    return {
      news_id: newsId,
      success: true,
      quality: {
        attemptedRetry: false,
      },
    }
  } catch (error) {
    // Unexpected error
    const unexpectedError: DetailedError = {
      type: 'UnknownError',
      message: `Unexpected error processing news ${newsId}: ${error instanceof Error ? error.message : String(error)}`,
      canRetry: false,
      severity: 'fatal',
      originalError: error instanceof Error ? error : new Error(String(error)),
      context: {
        model: 'gpt-4o-mini',
        timestamp: new Date().toISOString(),
      },
    }

    OpenAIErrorLogger.log(unexpectedError, { newsId })

    return {
      news_id: newsId,
      success: false,
      error: unexpectedError,
      quality: {
        errorType: unexpectedError.type,
        severity: unexpectedError.severity,
        attemptedRetry: false,
      },
    }
  }
}

/**
 * Process a batch of news items with improved error handling
 * Uses Promise.allSettled to continue on errors instead of failing on first error
 * Provides detailed breakdown of failures for logging and quality tracking
 *
 * @param supabase - Supabase client
 * @param news - Array of news items to process
 * @param maxConcurrency - Max parallel requests (default 3)
 * @returns Batch result with success/failure breakdown and error analysis
 */
export async function processNewsTopicsBatchV2(
  supabase: AppSupabaseClient,
  news: Array<{ id: string; title: string; description: string | null }>,
  maxConcurrency = 3
): Promise<BatchProcessResult> {
  const results: TopicProcessResult[] = []

  // Process in batches with concurrency limit
  for (let i = 0; i < news.length; i += maxConcurrency) {
    const batch = news.slice(i, i + maxConcurrency)

    // Use allSettled to capture all results, including failures
    const settledResults = await Promise.allSettled(
      batch.map((n) => processNewsTopicV2(supabase, n.id, n.title, n.description))
    )

    // Extract results from settled promises
    for (const settled of settledResults) {
      if (settled.status === 'fulfilled') {
        results.push(settled.value)
      } else {
        // Promise rejected - should be rare since processNewsTopicV2 catches errors
        results.push({
          news_id: 'unknown',
          success: false,
          error: {
            type: 'UnknownError',
            message: `Promise rejection: ${settled.reason}`,
            canRetry: false,
            severity: 'fatal',
            originalError: settled.reason instanceof Error ? settled.reason : new Error(String(settled.reason)),
            context: {
              model: 'gpt-4o-mini',
              timestamp: new Date().toISOString(),
            },
          },
          quality: {
            errorType: 'UnknownError',
            severity: 'fatal',
            attemptedRetry: false,
          },
        })
      }
    }
  }

  // Analyze results for logging and quality metrics
  const successful = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  const errorsByType = results
    .filter((r) => !r.success && r.error)
    .reduce(
      (acc, r) => {
        const type = r.error!.type
        acc[type] = (acc[type] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

  const batchResult: BatchProcessResult = {
    total: results.length,
    successful,
    failed,
    results,
    errorsByType,
    successRate: ((successful / results.length) * 100).toFixed(2) + '%',
  }

  // Log batch summary for analytics
  OpenAIErrorLogger.logBatchResults(
    results.map((r) => ({
      newsId: r.news_id,
      success: r.success,
      error: r.error,
    })),
    'gpt-4o-mini'
  )

  return batchResult
}

/**
 * Consolidate topics for a client with error tracking
 * Now returns success/error info instead of silently failing
 *
 * @param supabase - Supabase client
 * @param clientId - Client ID
 * @param daysBack - Look back N days (default 7)
 * @returns Result with success flag and error details
 */
export async function consolidateClientTopicsV2(
  supabase: AppSupabaseClient,
  clientId: string,
  daysBack = 7
): Promise<{
  success: boolean
  clustersCreated: number
  error?: DetailedError
}> {
  try {
    // 1. Fetch recent topic matches for client
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()

    const { data: clientNews, error: matchError } = await supabase
      .schema('noticias')
      .from('client_theme_matches')
      .select('news_id')
      .eq('client_id', clientId)
      .gte('matched_at', sinceDate)

    if (matchError) {
      return {
        success: false,
        clustersCreated: 0,
        error: {
          type: 'APIError',
          message: `Failed to fetch client matches: ${matchError.message}`,
          canRetry: true,
          severity: 'degraded',
          originalError: new Error(matchError.message),
          context: {
            model: 'gpt-4o-mini',
            timestamp: new Date().toISOString(),
          },
        },
      }
    }

    if (!clientNews || clientNews.length === 0) {
      console.log(`[TopicProcessor] No news for client ${clientId}`)
      return {
        success: true,
        clustersCreated: 0,
      }
    }

    // 2. Fetch topics for these news items
    const newsIds = [...new Set(clientNews.map((cn) => cn.news_id))]
    const { data: newsTopics, error: topicsError } = await supabase
      .schema('noticias')
      .from('news_topics')
      .select('topics')
      .in('news_id', newsIds)

    if (topicsError) {
      return {
        success: false,
        clustersCreated: 0,
        error: {
          type: 'APIError',
          message: `Failed to fetch news topics: ${topicsError.message}`,
          canRetry: true,
          severity: 'degraded',
          originalError: new Error(topicsError.message),
          context: {
            model: 'gpt-4o-mini',
            timestamp: new Date().toISOString(),
          },
        },
      }
    }

    if (!newsTopics || newsTopics.length === 0) {
      console.log(`[TopicProcessor] No extracted topics for client ${clientId}`)
      return {
        success: true,
        clustersCreated: 0,
      }
    }

    // 3. Consolidate topics
    const allTopics = newsTopics
      .flatMap((nt) => (nt.topics as any[]) || [])
      .filter((t) => t && t.name)

    if (allTopics.length === 0) {
      return {
        success: true,
        clustersCreated: 0,
      }
    }

    // 4. Cluster themes with error tracking
    const clusterResult = await clusterThemesWithErrorTracking(allTopics)

    if (!clusterResult.success) {
      return {
        success: false,
        clustersCreated: 0,
        error: clusterResult.error,
      }
    }

    const clusters = clusterResult.data || []

    // 5. Save clusters as global themes
    let savedCount = 0
    for (const cluster of clusters) {
      const { error: saveError } = await supabase
        .schema('noticias')
        .from('global_themes')
        .upsert(
          {
            name: cluster.cluster_name,
            source: 'nlp_auto',
            confidence: cluster.confidence,
            status: 'active',
          },
          { onConflict: 'name' }
        )

      if (!saveError) {
        savedCount++
      }
    }

    console.log(
      `[TopicProcessor] Consolidated ${savedCount}/${clusters.length} themes for client ${clientId}`
    )

    return {
      success: savedCount > 0,
      clustersCreated: savedCount,
    }
  } catch (error) {
    return {
      success: false,
      clustersCreated: 0,
      error: {
        type: 'UnknownError',
        message: `Unexpected error consolidating topics: ${error instanceof Error ? error.message : String(error)}`,
        canRetry: false,
        severity: 'fatal',
        originalError: error instanceof Error ? error : new Error(String(error)),
        context: {
          model: 'gpt-4o-mini',
          timestamp: new Date().toISOString(),
        },
      },
    }
  }
}
