# OpenAI Error Handling - Quick Reference

One-page guide for common tasks.

## Files to Copy

```bash
src/lib/
├── openai-error-handler.ts    (380 lines - core infrastructure)
├── openai-nlp-tracked.ts      (220 lines - wrapped functions)
└── types/openai.ts            (200 lines - TypeScript types)

src/services/
└── topic-processor-v2.ts      (280 lines - batch processor)
```

## Error Types at a Glance

```typescript
RateLimitError     → 429 → canRetry: true  → severity: degraded
APIError           → 5xx → canRetry: true  → severity: degraded
AuthenticationError → 401 → canRetry: false → severity: fatal
ValidationError    → 400 → canRetry: false → severity: fatal
NetworkError       → DNS → canRetry: true  → severity: degraded
TimeoutError       → 408 → canRetry: true  → severity: degraded
UnknownError       → ??? → canRetry: false → severity: fatal
```

## Common Patterns

### Pattern 1: Check Result Success

```typescript
const result = await extractTopicsWithErrorTracking(title, description)

if (result.success) {
  return result.data
} else {
  // Handle error
}
```

### Pattern 2: Handle Fatal vs Degraded

```typescript
if (result.error.severity === 'fatal') {
  throw new Error(result.error.message)
} else {
  return defaultData()
}
```

### Pattern 3: Log Error

```typescript
import { OpenAIErrorLogger } from '@/lib/openai-error-handler'

if (!result.success) {
  OpenAIErrorLogger.log(result.error, { newsId: 'abc-123' })
}
```

### Pattern 4: Batch Processing

```typescript
import { processNewsTopicsBatchV2 } from '@/services/topic-processor-v2'

const batch = await processNewsTopicsBatchV2(supabase, newsArray)

console.log(`Success: ${batch.successful}/${batch.total}`)
console.log(`Errors: ${JSON.stringify(batch.errorsByType)}`)

// Access individual results
for (const result of batch.results) {
  if (!result.success && result.error.canRetry) {
    addToRetryQueue(result.news_id)
  }
}
```

### Pattern 5: Retry with Backoff

```typescript
import { OpenAIRetryStrategy } from '@/lib/openai-error-handler'

const strategy = new OpenAIRetryStrategy()
const result = await strategy.executeWithRetry(
  () => extractTopicsWithErrorTracking(title, description),
  { model: 'gpt-4o-mini' }
)

if (result.success) {
  return result.data
}
```

## Response Structure

### Success
```typescript
{
  success: true,
  data: ExtractedTopics,
  quality: { success: true, model: 'gpt-4o-mini' }
}
```

### Error
```typescript
{
  success: false,
  error: {
    type: 'RateLimitError',
    message: 'API rate limit exceeded',
    canRetry: true,
    severity: 'degraded',
    retryAfterMs: 60000,
    originalError: Error,
    context: { model, maxTokens, timestamp }
  },
  quality: { 
    success: false, 
    errorType: 'RateLimitError',
    severity: 'degraded',
    model: 'gpt-4o-mini' 
  }
}
```

### Batch Result
```typescript
{
  total: 100,
  successful: 95,
  failed: 5,
  successRate: '95.00%',
  errorsByType: { RateLimitError: 3, NetworkError: 2 },
  results: TopicProcessResult[]
}
```

## Alert Conditions

| Condition | Action |
|-----------|--------|
| AuthenticationError > 0 | 🚨 Check OPENAI_API_KEY immediately |
| RateLimitError > 5 | ⚠️ Reduce batch size/concurrency |
| NetworkError > 3 | 🌐 Check network connectivity |
| successRate < 90% | ⚠️ Monitor API health |
| successRate < 70% | 🚨 Critical - escalate |

## Testing

### Mock Success
```typescript
jest.spyOn(openai.chat.completions, 'create')
  .mockResolvedValue({
    choices: [{ message: { content: '{"topics": [...]}' } }]
  })
```

### Mock Rate Limit
```typescript
jest.spyOn(openai.chat.completions, 'create')
  .mockRejectedValue(new OpenAI.RateLimitError('429'))
```

### Mock Auth Error
```typescript
jest.spyOn(openai.chat.completions, 'create')
  .mockRejectedValue(new OpenAI.AuthenticationError('invalid key'))
```

## Debugging

### Enable Detailed Logging
```typescript
OpenAIErrorLogger.log(error, { 
  newsId: 'abc-123',
  batchSize: 100,
  metadata: { /* extra context */ }
})
```

### Check Error Details
```typescript
console.log(error.type)              // 'RateLimitError'
console.log(error.canRetry)          // true
console.log(error.severity)          // 'degraded'
console.log(error.retryAfterMs)      // 60000
console.log(error.originalError)     // Original Error object
console.log(error.openaiDetails)     // { status: 429, ... }
```

## Migration Steps

1. Copy 4 files to codebase
2. Import from new modules
3. Check `result.success` instead of catching
4. Add error logging with `OpenAIErrorLogger.log()`
5. Handle `error.severity` to decide fallback
6. Test success + failure paths
7. Deploy and monitor

## Common Mistakes to Avoid

❌ **Don't:** Ignore `result.error`
```typescript
const result = await extractTopicsWithErrorTracking(...)
return result.data  // Might be undefined!
```

✓ **Do:** Check success first
```typescript
const result = await extractTopicsWithErrorTracking(...)
if (result.success) return result.data
```

---

❌ **Don't:** Retry on all errors
```typescript
if (!result.success) {
  // Always retry
  await sleep(1000)
  // ...
}
```

✓ **Do:** Check canRetry
```typescript
if (!result.success && result.error.canRetry) {
  await sleep(result.error.retryAfterMs || 1000)
  // ...
}
```

---

❌ **Don't:** Lose error context
```typescript
catch (error) {
  console.log('Error!')  // Where? Why?
}
```

✓ **Do:** Log full context
```typescript
if (!result.success) {
  OpenAIErrorLogger.log(result.error, { newsId })
}
```

---

❌ **Don't:** Stop batch on first error
```typescript
const results = await Promise.all(
  items.map(item => processOneItem(item))
)  // Fails on first error!
```

✓ **Do:** Use allSettled
```typescript
const results = await Promise.allSettled(
  items.map(item => processOneItem(item))
)  // Gets all results including failures
```

## Documentation Map

| Document | Purpose | Read Time |
|----------|---------|-----------|
| `OPENAI_ERROR_STRATEGY.md` | Complete design & architecture | 30 min |
| `docs/OPENAI_INTEGRATION_GUIDE.md` | How to integrate | 20 min |
| `docs/BEFORE_AFTER_EXAMPLES.md` | Real-world examples | 15 min |
| `docs/CRON_INTEGRATION_EXAMPLE.md` | Cron job integration | 15 min |
| `docs/QUICK_REFERENCE.md` | This file | 5 min |

## Integration Checklist

```
Week 1: Deploy
[ ] Copy 4 implementation files
[ ] No code changes needed yet
[ ] Deploy as non-breaking

Week 2: Update One Endpoint
[ ] Pick 1 cron job or API endpoint
[ ] Replace extractTopicsFromNews with extractTopicsWithErrorTracking
[ ] Add error handling and logging
[ ] Test success and error paths
[ ] Deploy

Week 3: Monitor
[ ] Watch logs for 1 week
[ ] Verify success rate > 95%
[ ] Check for error patterns
[ ] Set up basic alerts

Week 4+: Expand
[ ] Update more endpoints
[ ] Build dashboard for metrics
[ ] Fine-tune fallback strategies
```

## Commands

### Check current status
```bash
curl http://localhost:3000/api/cron/detect-crises
```

### View error logs
```bash
# In production monitoring tool (e.g., Datadog, CloudWatch)
error_type: "RateLimitError" OR "NetworkError"
timestamp: last_24h
```

### Query quality metrics
```sql
SELECT timestamp, success_count, failure_count,
  (success_count::float / (success_count + failure_count) * 100) as rate
FROM noticias.openai_quality_metrics
WHERE timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;
```

## Support & Resources

- **TypeScript types:** `src/lib/types/openai.ts`
- **Error handling:** `src/lib/openai-error-handler.ts`
- **API wrappers:** `src/lib/openai-nlp-tracked.ts`
- **Batch processor:** `src/services/topic-processor-v2.ts`
- **Examples:** `docs/BEFORE_AFTER_EXAMPLES.md`
- **Integration:** `docs/CRON_INTEGRATION_EXAMPLE.md`

## Key Takeaways

1. ✓ Every error is categorized into 7 types
2. ✓ Callers decide how to handle each error
3. ✓ Backward compatible - no breaking changes
4. ✓ Quality metrics for dashboard monitoring
5. ✓ Batch processors continue on errors
6. ✓ Full logging context for debugging
7. ✓ Retry strategy with exponential backoff
8. ✓ TypeScript support throughout

Ready to integrate? Start with `docs/OPENAI_INTEGRATION_GUIDE.md`!
