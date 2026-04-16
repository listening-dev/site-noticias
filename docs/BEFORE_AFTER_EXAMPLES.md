# Before and After: OpenAI Error Handling Examples

Real-world examples showing the improvements from implementing the error handling strategy.

## Example 1: Simple API Endpoint

### Before: Silent Failure

```typescript
// src/app/api/analyze-news/route.ts
import { extractTopicsFromNews } from '@/services/openai-nlp'

export async function POST(req: NextRequest) {
  const { title, description } = await req.json()
  
  // Call OpenAI - errors are silently caught
  const topics = await extractTopicsFromNews(title, description)
  
  // Always returns data, but might be empty defaults
  return NextResponse.json({
    success: true,
    data: topics
  })
}
```

**Problem:** 
- Client gets `success: true` even if extraction failed
- No way to know if topics are real or defaults
- No retry information
- Dashboard can't track failure rate

### After: Transparent Error Handling

```typescript
// src/app/api/analyze-news/route.ts
import { extractTopicsWithErrorTracking } from '@/lib/openai-nlp-tracked'
import { OpenAIErrorLogger } from '@/lib/openai-error-handler'

export async function POST(req: NextRequest) {
  const { title, description, newsId } = await req.json()
  
  const result = await extractTopicsWithErrorTracking(title, description)
  
  if (result.success) {
    return NextResponse.json({
      success: true,
      data: result.data,
      quality: result.quality
    })
  }
  
  // Error occurred - provide detailed info
  const error = result.error
  
  OpenAIErrorLogger.log(error, { newsId })
  
  return NextResponse.json(
    {
      success: false,
      error: {
        type: error.type,
        message: error.message,
        canRetry: error.canRetry,
        severity: error.severity,
        retryAfterMs: error.retryAfterMs
      },
      quality: result.quality
    },
    {
      // Return appropriate HTTP status
      status: error.severity === 'fatal' ? 400 : 503
    }
  )
}
```

**Benefits:**
- Client knows if extraction succeeded or failed
- Client knows if it can retry and when to try
- Error type helps client decide on action
- Dashboard can track success vs failure
- Detailed logging for debugging

### Client Code Comparison

**Before:**
```typescript
const res = await fetch('/api/analyze-news', { method: 'POST', body })
const result = await res.json()

// Can't tell if topics are real or defaults
displayTopics(result.data)
```

**After:**
```typescript
const res = await fetch('/api/analyze-news', { method: 'POST', body })
const result = await res.json()

if (result.success) {
  displayTopics(result.data)
  trackQualityMetric('success')
} else {
  const error = result.error
  
  if (error.canRetry) {
    // Show retry UI with wait time
    showRetryButton(`Retry in ${error.retryAfterMs}ms`)
    trackQualityMetric('degraded')
  } else {
    // Show permanent error
    showErrorAlert(`Failed: ${error.message}`)
    trackQualityMetric('failed')
  }
}
```

---

## Example 2: Batch Processing

### Before: Fail on First Error

```typescript
// src/app/api/cron/process-batch/route.ts
import { processNewsTopicsBatch } from '@/services/topic-processor'

export async function POST() {
  const supabase = createClient(...)
  
  const { data: newsArray } = await supabase
    .schema('noticias')
    .from('news')
    .select('id, title, description')
    .is('processed_at', null)
  
  try {
    // Processes up to first error
    const results = await processNewsTopicsBatch(supabase, newsArray)
    
    // No info about which items failed or why
    return Response.json({
      processed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    })
  } catch (error) {
    // Batch failed completely - no partial results
    console.error('Batch failed:', error)
    return Response.json({ status: 'error' }, { status: 500 })
  }
}
```

**Problems:**
- Can't distinguish why failures occurred
- No visibility into error types (rate limit vs network vs auth)
- Batch stops on first error
- No quality metrics for monitoring
- Can't implement smart retry strategies

### After: Continue on Errors + Detailed Breakdown

```typescript
// src/app/api/cron/process-batch/route.ts
import { processNewsTopicsBatchV2 } from '@/services/topic-processor-v2'
import { OpenAIErrorLogger } from '@/lib/openai-error-handler'

export async function POST() {
  const supabase = createClient(...)
  
  const { data: newsArray } = await supabase
    .schema('noticias')
    .from('news')
    .select('id, title, description')
    .is('processed_at', null)
  
  // Process batch with error tracking - continues on failures
  const batchResult = await processNewsTopicsBatchV2(supabase, newsArray)
  
  // Log summary with error breakdown
  console.log(`
    Batch Processing Summary:
    - Total items: ${batchResult.total}
    - Successful: ${batchResult.successful}
    - Failed: ${batchResult.failed}
    - Success rate: ${batchResult.successRate}
    - Errors by type: ${JSON.stringify(batchResult.errorsByType)}
  `)
  
  // Handle specific error types
  if (batchResult.errorsByType.RateLimitError > 0) {
    console.warn(`⚠️  Rate limited ${batchResult.errorsByType.RateLimitError} times`)
    // Could implement backoff, reduce concurrency, etc
  }
  
  if (batchResult.errorsByType.AuthenticationError > 0) {
    console.error(`🚨 Auth error - API key may be invalid`)
    await alertOpsTeam('OpenAI API key authentication failed')
  }
  
  if (batchResult.errorsByType.NetworkError > 0) {
    console.warn(`🌐 Network errors: ${batchResult.errorsByType.NetworkError}`)
  }
  
  // Store metrics for dashboard
  await storeQualityMetrics(supabase, {
    timestamp: new Date(),
    batchSize: batchResult.total,
    successCount: batchResult.successful,
    failureCount: batchResult.failed,
    errorBreakdown: batchResult.errorsByType,
    successRate: parseFloat(batchResult.successRate)
  })
  
  // Handle retryable failures
  const retryableFailures = batchResult.results
    .filter(r => !r.success && r.error?.canRetry)
  
  if (retryableFailures.length > 0) {
    console.log(`Queueing ${retryableFailures.length} items for retry`)
    await addToRetryQueue(retryableFailures)
  }
  
  // Handle permanent failures
  const permanentFailures = batchResult.results
    .filter(r => !r.success && !r.error?.canRetry)
  
  if (permanentFailures.length > 0) {
    console.error(`${permanentFailures.length} items failed permanently`)
    // Mark as failed in database or alert user
    for (const item of permanentFailures) {
      await markAsFailed(supabase, item.news_id, item.error?.message)
    }
  }
  
  return Response.json({
    status: 'completed',
    ...batchResult
  })
}
```

**Benefits:**
- Clear breakdown of what succeeded vs failed
- Knows which errors are retryable vs permanent
- Can implement intelligent fallback strategies
- Quality metrics for dashboard monitoring
- Can alert on specific error types
- Batch continues on failures, maximizing progress

### Monitoring Output Comparison

**Before:**
```
[Batch] Processed 87 items
[Error] Network error: ECONNRESET
```

**After:**
```
Batch Processing Summary:
- Total items: 100
- Successful: 92
- Failed: 8
- Success rate: 92.00%
- Errors by type: {
    "NetworkError": 3,
    "RateLimitError": 4,
    "ValidationError": 1
  }

⚠️  Rate limited 4 times
🌐 Network errors: 3
🚨 Failed permanently: 1

Queueing 7 items for retry
1 items failed permanently
```

---

## Example 3: Smart Fallback Chain

### Before: No Options

```typescript
// News analysis with no fallback options
async function analyzeNews(title: string, description: string) {
  const topics = await extractTopicsFromNews(title, description)
  
  // If OpenAI fails, we get defaults with no way to improve
  return topics
}
```

### After: Progressive Fallback

```typescript
import { extractTopicsWithErrorTracking } from '@/lib/openai-nlp-tracked'

async function analyzeNewsWithFallbacks(
  title: string,
  description: string,
  newsId: string
) {
  // Strategy: Fresh → Cache → Degraded Default
  
  // 1. Try fresh extraction
  const freshResult = await extractTopicsWithErrorTracking(title, description)
  
  if (freshResult.success) {
    console.log(`[${newsId}] Fresh extraction successful`)
    return {
      source: 'fresh',
      data: freshResult.data,
      quality: 'primary'
    }
  }
  
  const error = freshResult.error
  
  // 2. If fatal error, try cache
  if (error.severity === 'fatal') {
    const cached = await getFromCache(newsId)
    if (cached) {
      console.log(`[${newsId}] Using cached extraction (fatal error: ${error.type})`)
      return {
        source: 'cache',
        data: cached,
        quality: 'cached'
      }
    }
  }
  
  // 3. If degraded error, still try cache first
  if (error.severity === 'degraded') {
    const cached = await getFromCache(newsId)
    if (cached) {
      console.log(`[${newsId}] Using cached extraction (degraded: ${error.type})`)
      return {
        source: 'cache',
        data: cached,
        quality: 'cached'
      }
    }
  }
  
  // 4. Last resort: use default values
  console.warn(`[${newsId}] Using default extraction (${error.message})`)
  return {
    source: 'default',
    data: {
      topics: [],
      entities: [],
      sentiment: 'neutral',
      category: 'outros'
    },
    quality: 'degraded'
  }
}
```

**Benefits:**
- Maximizes data availability
- Clearly indicates data quality source
- Can still show cached results when API fails
- Graceful degradation instead of hard failure
- Dashboard can track which data sources were used

---

## Example 4: Crisis Detection Improvement

### Before: Silent Failures Mask Crises

```typescript
// Crisis detection with hidden failures
async function detectCrises(supabase, clientId) {
  // 1. Get client themes
  const themes = await getClientThemes(supabase, clientId)
  
  // 2. Cluster themes - errors are silent
  const clusters = await clusterThemes(themes)
  // If clustering fails, returns simple ungrouped themes
  
  // 3. Detect crises - can't tell if analysis was good
  const crisisThreshold = 10
  for (const cluster of clusters) {
    const count = await countMatches(supabase, cluster)
    if (count >= crisisThreshold) {
      // But was clustering even successful?
      // Might be missing real crises!
      await createAlert(supabase, cluster, count)
    }
  }
}
```

### After: Transparent Crisis Detection

```typescript
import { clusterThemesWithErrorTracking } from '@/lib/openai-nlp-tracked'
import { OpenAIErrorLogger } from '@/lib/openai-error-handler'

async function detectCrisesWithTracking(supabase, clientId) {
  try {
    // 1. Get client themes
    const themes = await getClientThemes(supabase, clientId)
    
    // 2. Cluster themes with error tracking
    const clusterResult = await clusterThemesWithErrorTracking(themes)
    
    if (!clusterResult.success) {
      const error = clusterResult.error
      OpenAIErrorLogger.log(error, { newsId: `client-${clientId}` })
      
      if (error.severity === 'fatal') {
        console.error(`Cannot cluster themes for ${clientId}: ${error.message}`)
        // Don't proceed with incomplete analysis
        throw new Error('Crisis detection unavailable')
      }
      
      // Degraded - can continue with ungrouped themes
      console.warn(`Theme clustering failed, using raw themes: ${error.message}`)
    }
    
    const clusters = clusterResult.data || themes.map(t => ({
      cluster_name: t.name,
      members: [t.name],
      confidence: t.confidence
    }))
    
    // 3. Detect crises with confidence about data quality
    const crisisThreshold = 10
    let detectionsCount = 0
    
    for (const cluster of clusters) {
      const count = await countMatches(supabase, cluster)
      if (count >= crisisThreshold) {
        await createAlert(supabase, {
          ...cluster,
          analysisQuality: clusterResult.success ? 'primary' : 'degraded'
        }, count)
        detectionsCount++
      }
    }
    
    console.log(`[Crises] Detected ${detectionsCount} crises for ${clientId}`)
    return {
      success: true,
      detectionsCount,
      analysisQuality: clusterResult.success ? 'complete' : 'partial'
    }
  } catch (error) {
    console.error(`Crisis detection failed for ${clientId}:`, error)
    return {
      success: false,
      detectionsCount: 0,
      error: error.message
    }
  }
}
```

**Benefits:**
- Clear distinction between "no crises" vs "can't detect crises"
- Dashboard shows analysis quality
- Can alert when detection is degraded
- Prevents missing crises due to silent failures
- Stakeholders know about data quality

---

## Example 5: Dashboard Quality Metrics

### Before: No Quality Tracking

```typescript
// No metrics available
SELECT COUNT(*) FROM news_topics
// How many have real analysis vs defaults? Unknown.
```

### After: Quality Metrics Available

```typescript
// With the optional schema changes:

-- View success rate over time
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  success_count,
  failure_count,
  ROUND(100.0 * success_count / (success_count + failure_count), 2) as success_rate
FROM noticias.openai_quality_metrics
ORDER BY hour DESC;

-- Identify problematic error types
SELECT 
  error_type,
  COUNT(*) as frequency,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM noticias.openai_error_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY error_type
ORDER BY frequency DESC;

-- Alert on critical errors
SELECT 
  COUNT(*) as auth_failures,
  MAX(created_at) as last_failure
FROM noticias.openai_error_logs
WHERE error_type = 'AuthenticationError'
  AND created_at > NOW() - INTERVAL '1 hour';
```

**Dashboard Visualization:**
```
OpenAI API Health
┌─────────────────────────┐
│ Success Rate: 96.5%     │ ← Last 24h
│ Errors: 142             │
│ Retries: 28             │
└─────────────────────────┘

Error Breakdown (Last 24h)
┌───────────────┬──────────┬──────────┐
│ Error Type    │ Count    │ Percent  │
├───────────────┼──────────┼──────────┤
│ NetworkError  │ 95       │ 66.9%    │
│ RateLimitErr  │ 45       │ 31.7%    │
│ ValidationErr │ 2        │ 1.4%     │
└───────────────┴──────────┴──────────┘
```

---

## Summary: Key Improvements

| Aspect | Before | After |
|--------|--------|-------|
| **Error Visibility** | Hidden, silent failures | Explicit, categorized |
| **Client Feedback** | Always "success" | Clear success/failure + retry info |
| **Batch Processing** | Stops on first error | Continues, detailed breakdown |
| **Error Types** | Generic "error" | 7 specific types |
| **Retryability** | Unknown | Explicit canRetry flag |
| **Fallback Options** | None | Can implement smart fallbacks |
| **Logging** | Minimal context | Full context + quality metrics |
| **Monitoring** | No metrics | Dashboard-ready metrics |
| **Crisis Detection** | May miss crises silently | Knows when analysis is degraded |
| **Operational Alerts** | React to failures after fact | Proactive alerts on error patterns |

---

## Quick Integration Checklist

- [ ] Copy `openai-error-handler.ts` to `src/lib/`
- [ ] Copy `openai-nlp-tracked.ts` to `src/lib/`
- [ ] Copy `topic-processor-v2.ts` to `src/services/`
- [ ] Pick one API endpoint to update
- [ ] Replace `extractTopicsFromNews` with `extractTopicsWithErrorTracking`
- [ ] Add error handling: check `result.success`
- [ ] Add logging: `OpenAIErrorLogger.log(error)`
- [ ] Deploy and monitor for 1 week
- [ ] Gradually update remaining endpoints
- [ ] Build dashboard to visualize metrics
