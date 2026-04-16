# OpenAI Error Handling Implementation

Complete, production-ready error handling strategy for OpenAI API calls focused on explicit categorization and transparent fallback chains.

## What's This?

The current code catches all OpenAI errors silently and returns defaults. Users don't know if analysis succeeded or failed. This implementation provides:

✓ **Explicit error categorization** - 7 distinct error types (RateLimitError, APIError, AuthenticationError, ValidationError, NetworkError, TimeoutError, UnknownError)
✓ **Transparent fallback chains** - Callers decide whether to accept degraded results or reject
✓ **Backward compatible** - Existing functions unchanged; new functions use V2 suffix
✓ **Production observability** - Every error categorized and logged with full context
✓ **Quality metrics** - Dashboard-ready analytics for error tracking

## Quick Start (5 minutes)

1. **Copy 4 files to your codebase:**
   ```
   src/lib/openai-error-handler.ts
   src/lib/openai-nlp-tracked.ts
   src/lib/types/openai.ts
   src/services/topic-processor-v2.ts
   ```

2. **Read the quick reference:**
   → `docs/QUICK_REFERENCE.md` (5 min read)

3. **Update one endpoint:**
   → `docs/OPENAI_INTEGRATION_GUIDE.md` → Pattern 2: Cron Job

4. **Test and deploy!**

## Documentation Guide

### For Quick Understanding
- **Start here:** `docs/QUICK_REFERENCE.md` (5 min)
- **Then see:** `docs/BEFORE_AFTER_EXAMPLES.md` (15 min)

### For Integration
- **How to use:** `docs/OPENAI_INTEGRATION_GUIDE.md` (20 min)
- **Specific example:** `docs/CRON_INTEGRATION_EXAMPLE.md` (15 min)
- **All patterns:** `docs/OPENAI_INTEGRATION_GUIDE.md` sections

### For Deep Understanding
- **Full design:** `OPENAI_ERROR_STRATEGY.md` (30 min)
- **Summary:** `OPENAI_ERROR_STRATEGY_SUMMARY.md` (10 min)

### For Code
- **Error handler:** `src/lib/openai-error-handler.ts` (380 lines)
- **Tracked functions:** `src/lib/openai-nlp-tracked.ts` (286 lines)
- **Batch processor:** `src/services/topic-processor-v2.ts` (412 lines)
- **Types:** `src/lib/types/openai.ts` (253 lines)

## Reading Paths

### Path A: Just Want It Working (30 min)
1. Copy 4 files
2. Read `QUICK_REFERENCE.md`
3. Read relevant pattern in `OPENAI_INTEGRATION_GUIDE.md`
4. Copy code from `CRON_INTEGRATION_EXAMPLE.md`
5. Test

### Path B: Want to Understand Design (90 min)
1. Read `BEFORE_AFTER_EXAMPLES.md`
2. Read `OPENAI_ERROR_STRATEGY_SUMMARY.md`
3. Read `OPENAI_ERROR_STRATEGY.md`
4. Read code comments in `openai-error-handler.ts`
5. Skim `OPENAI_INTEGRATION_GUIDE.md`

### Path C: Deep Technical Review (2+ hours)
1. Read entire `OPENAI_ERROR_STRATEGY.md`
2. Study code with comments in all 4 files
3. Review `OPENAI_INTEGRATION_GUIDE.md` all patterns
4. Review database schema section
5. Review trade-offs and alternatives

## File Structure

```
dash-noticias/
├── OPENAI_ERROR_STRATEGY.md              (Design document - 649 lines)
├── OPENAI_ERROR_STRATEGY_SUMMARY.md      (Summary - 357 lines)
│
├── docs/
│   ├── README_OPENAI_ERROR_HANDLING.md   (This file)
│   ├── QUICK_REFERENCE.md                (Quick guide - 350 lines)
│   ├── OPENAI_INTEGRATION_GUIDE.md       (How-to - 554 lines)
│   ├── BEFORE_AFTER_EXAMPLES.md          (Examples - 567 lines)
│   └── CRON_INTEGRATION_EXAMPLE.md       (Cron specific - 477 lines)
│
└── src/
    ├── lib/
    │   ├── openai-error-handler.ts       (Core - 379 lines)
    │   ├── openai-nlp-tracked.ts         (Wrappers - 286 lines)
    │   └── types/
    │       └── openai.ts                  (Types - 253 lines)
    │
    └── services/
        └── topic-processor-v2.ts          (Batch - 412 lines)

Total: 1,330 lines of code + 2,954 lines of documentation
```

## Key Components

### 1. OpenAIErrorHandler (src/lib/openai-error-handler.ts)
Classifies errors into 7 types with retry guidance:
```typescript
OpenAIErrorHandler.classify(error, context) 
  → { type, message, canRetry, severity, context, retryAfterMs, ... }
```

### 2. OpenAIErrorLogger (src/lib/openai-error-handler.ts)
Logs errors with full context for debugging and analytics:
```typescript
OpenAIErrorLogger.log(detailedError, { newsId, batchSize, ... })
OpenAIErrorLogger.logBatchResults(results, model)
```

### 3. OpenAIRetryStrategy (src/lib/openai-error-handler.ts)
Retries with exponential backoff and jitter:
```typescript
new OpenAIRetryStrategy(maxRetries, baseDelay, maxDelay)
  .executeWithRetry(fn, context)
  → { success, data?, error? }
```

### 4. Error-Tracked Functions (src/lib/openai-nlp-tracked.ts)
Drop-in replacements that return structured errors:
```typescript
extractTopicsWithErrorTracking(title, description)
  → TrackedResult<ExtractedTopics>

clusterThemesWithErrorTracking(themes)
  → TrackedResult<ClusteredTheme[]>
```

### 5. Improved Batch Processor (src/services/topic-processor-v2.ts)
Uses allSettled for partial success:
```typescript
processNewsTopicsBatchV2(supabase, newsArray, maxConcurrency)
  → { total, successful, failed, results, errorsByType, successRate }
```

## Error Types at a Glance

| Type | HTTP | Retryable | Severity |
|------|------|-----------|----------|
| RateLimitError | 429 | ✓ | degraded |
| APIError | 5xx, 408 | ✓ | degraded |
| AuthenticationError | 401 | ✗ | fatal |
| ValidationError | 400 | ✗ | fatal |
| NetworkError | - | ✓ | degraded |
| TimeoutError | - | ✓ | degraded |
| UnknownError | - | ✗ | fatal |

## Integration Timeline

### Week 1: Deploy Infrastructure
- Copy 4 files
- No breaking changes
- No API modifications yet

### Week 2: Update One Endpoint
- Pick lowest-risk endpoint (e.g., cron job)
- Update `src/app/api/cron/detect-crises/route.ts`
- Follow `CRON_INTEGRATION_EXAMPLE.md`
- Monitor for 1 week

### Week 3: Expand
- Update related endpoints
- Build basic dashboard view
- Monitor error patterns

### Week 4+: Complete
- Migrate remaining endpoints
- Mark old functions as deprecated
- Plan removal in next major version

## Testing Quick Start

```typescript
// Test success
const result = await extractTopicsWithErrorTracking('Title', 'Desc')
expect(result.success).toBe(true)
expect(result.data).toBeDefined()

// Test rate limit
jest.spyOn(openai.chat.completions, 'create')
  .mockRejectedValue(new OpenAI.RateLimitError('429'))
const result = await extractTopicsWithErrorTracking('Title', 'Desc')
expect(result.error.type).toBe('RateLimitError')
expect(result.error.canRetry).toBe(true)

// Test batch
const batch = await processNewsTopicsBatchV2(supabase, newsArray)
expect(batch.total).toBeGreaterThan(0)
expect(batch.errorsByType).toBeDefined()
```

## Monitoring & Alerts

### Health Check Endpoint
```typescript
GET /api/health/openai
→ { status: 'healthy'|'degraded', uptime: '96.5%', ... }
```

### Alert Conditions
- AuthenticationError → 🚨 Critical (immediate)
- RateLimitError > 5 → ⚠️ Warning (reduce concurrency)
- successRate < 90% → ⚠️ Warning (investigate)
- successRate < 70% → 🚨 Critical (escalate)

### Database Metrics (Optional)
```sql
SELECT * FROM noticias.openai_quality_metrics
ORDER BY timestamp DESC LIMIT 10
```

## Before & After

### Before
```typescript
// Silent failure - no way to know what happened
const topics = await extractTopicsFromNews(title, description)
return { success: true, data: topics }  // Even if extraction failed!
```

### After
```typescript
// Explicit error handling
const result = await extractTopicsWithErrorTracking(title, description)

if (result.success) {
  return { success: true, data: result.data }
} else {
  const error = result.error
  
  if (error.severity === 'fatal') {
    return { success: false, error: error.message }
  } else {
    return { success: true, data: defaultTopics() }
  }
}
```

## FAQ

**Q: Will this break my existing code?**
A: No. New functions use V2 suffix. Old functions unchanged. Migrate gradually.

**Q: Do I need a database schema change?**
A: No. Quality metrics are optional. Can log to console initially.

**Q: How long to integrate?**
A: 1 hour to copy files + update one endpoint. Gradual migration over 4 weeks.

**Q: What if I just want the error handler?**
A: You can use just `openai-error-handler.ts` and write your own wrappers.

**Q: Can I use this with other AI providers?**
A: Not directly, but error handler pattern is easily adapted for others.

## Common Patterns

### Pattern 1: Simple Error Handling
See: `docs/QUICK_REFERENCE.md` → "Pattern 1"

### Pattern 2: Batch Processing
See: `docs/QUICK_REFERENCE.md` → "Pattern 4"

### Pattern 3: Intelligent Fallback
See: `docs/BEFORE_AFTER_EXAMPLES.md` → "Example 3"

### Pattern 4: Cron Job with Monitoring
See: `docs/CRON_INTEGRATION_EXAMPLE.md`

### Pattern 5: Retry with Custom Logic
See: `docs/QUICK_REFERENCE.md` → "Pattern 5"

## Next Steps

1. **Understand it:** Read `QUICK_REFERENCE.md` (5 min)
2. **See examples:** Read `BEFORE_AFTER_EXAMPLES.md` (15 min)
3. **Copy files:** 4 TypeScript files to codebase
4. **Pick endpoint:** Choose one to update
5. **Integrate:** Follow `OPENAI_INTEGRATION_GUIDE.md`
6. **Test:** Run unit + integration tests
7. **Deploy:** Monitor for 1 week
8. **Expand:** Migrate remaining endpoints

## Support

- **Questions about design?** → Read `OPENAI_ERROR_STRATEGY.md`
- **Questions about code?** → Check comments in implementation files
- **Questions about integration?** → See `OPENAI_INTEGRATION_GUIDE.md`
- **Real-world examples?** → See `BEFORE_AFTER_EXAMPLES.md`
- **Quick reference?** → See `QUICK_REFERENCE.md`

---

## Summary

**What you get:**
- Explicit error categorization (7 types)
- Transparent result handling (success/error/quality)
- Backward compatible (V2 functions, old unchanged)
- Production ready (logging, retry, metrics)
- Well documented (6 guides + code comments)
- Easy to test (mockable errors, predictable responses)

**Time investment:**
- Reading: 30-90 minutes depending on depth
- Integration: 1 hour per endpoint
- Full migration: 4 weeks (1 endpoint/week)

**Value delivered:**
- Know when analysis fails vs returns defaults
- Alert on critical errors immediately
- Track API reliability over time
- Implement intelligent fallback strategies
- Debug issues with full context

**Ready?** Start with `QUICK_REFERENCE.md` →
