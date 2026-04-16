# Design B Implementation Checklist

Quick reference for implementing Design B optimizations. Each change is independent and can be deployed separately.

## Change 1: Semaphore for Filter Matching

**Target File**: `src/lib/semaphore.ts` (NEW) + `src/services/news-matcher.ts`
**Effort**: 30 minutes
**Gain**: 1-2 seconds

### Checklist

- [ ] Create `src/lib/semaphore.ts` with Semaphore class
- [ ] Export `processBatchWithSemaphore()` helper
- [ ] Update news-matcher.ts import
- [ ] Replace `Promise.allSettled(filters.map(...))` with `processBatchWithSemaphore(filters, 5, ...)`
- [ ] Test: Verify concurrency cap is 5
- [ ] Test: Run with 20+ filters, check response time

### Code Template

```typescript
// src/lib/semaphore.ts - Copy the full implementation from OPTIMIZATION_STRATEGY_DESIGN_B.md
// Then in news-matcher.ts:

import { processBatchWithSemaphore } from '@/lib/semaphore'

// Line ~29, replace:
// OLD: const filterResults = await Promise.allSettled(filters.map(...))
// NEW:
const filterResults = await processBatchWithSemaphore(
  filters,
  5,
  (filter) => matchFilter(supabase, filter, since)
)
```

---

## Change 2: Optimize Crisis Detection Query

**Target Files**: Database migration + `src/services/crisis-detector.ts`
**Effort**: 30 minutes
**Gain**: 2-3 seconds

### Checklist

- [ ] Create migration file: `supabase/migrations/<timestamp>_add_crisis_aggregation_rpc.sql`
- [ ] Add RPC function and index (SQL from appendix)
- [ ] Run migration: `supabase db push`
- [ ] Create `detectCrisesForAllClientsOptimized()` in crisis-detector.ts
- [ ] Add logging: log RPC call count (should be 1)
- [ ] Test: Compare old vs new results (should be identical)

### Code Template

```typescript
// In crisis-detector.ts, add after existing functions:
export async function detectCrisesForAllClientsOptimized(
  supabase: AppSupabaseClient,
  timeWindowMinutes: number = 60
): Promise<CrisisDetectionResult[]> {
  // Copy implementation from OPTIMIZATION_STRATEGY_DESIGN_B.md
  // Key: Call supabase.rpc('count_crisis_matches_aggregated', { since_time })
  // This replaces nested for loops
}
```

### SQL Template

```sql
-- supabase/migrations/001_add_crisis_aggregation_rpc.sql
-- Copy the full migration from OPTIMIZATION_STRATEGY_DESIGN_B.md appendix
```

---

## Change 3: Selective Projection

**Target File**: `src/services/jsonb-search.ts`
**Effort**: 20 minutes
**Gain**: 0.5-1 second

### Checklist

- [ ] Add `ProjectionConfig` interface
- [ ] Add `getNewsProjection()` helper function
- [ ] Update `matchNewsByTsquery()` to use `getNewsProjection({ purpose: 'matching' })`
- [ ] Update `findNewsByTopicNameWithDetails()` to use `getNewsProjection({ purpose: 'display' })`
- [ ] Test: Verify projection content matches expected fields

### Code Template

```typescript
// At top of jsonb-search.ts, add:

export interface ProjectionConfig {
  purpose: 'matching' | 'analysis' | 'display'
}

export function getNewsProjection(config: ProjectionConfig): string {
  switch (config.purpose) {
    case 'matching':
      return 'id, title, published_at, search_vector'
    case 'analysis':
      return 'id, title, description, published_at, search_vector, category'
    case 'display':
      return '*, sources(*), news_topics(*)'
    default:
      return '*'
  }
}

// Then in matchNewsByTsquery():
const projection = getNewsProjection({ purpose: 'matching' })
const { data: matchedNews } = await supabase
  .schema('noticias')
  .from('news')
  .select(projection)  // ADD THIS LINE
  .rpc('match_news_by_tsquery_safe', { ... })
```

---

## Change 4: Adaptive Batch Sizing

**Target Files**: `src/services/topic-processor.ts` + `src/app/api/cron/fetch-feeds/route.ts`
**Effort**: 20 minutes
**Gain**: 1-2 seconds

### Checklist

- [ ] Add `calculateAdaptiveBatchSize()` function to topic-processor.ts
- [ ] Add `processNewsTopicsBatchAdaptive()` function
- [ ] Import TokenBudgetManager in topic-processor.ts
- [ ] Update fetch-feeds/route.ts to:
  - Calculate `timeRemainingMs` at start of topic processing
  - Call `processNewsTopicsBatchAdaptive()` instead of `processNewsTopicsBatch()`
- [ ] Test: Verify batch size adjusts based on time/token budget

### Code Template

```typescript
// In topic-processor.ts, add:

export function calculateAdaptiveBatchSize(options: {
  timeRemainingMs: number
  tokenBudget: TokenBudgetManager
  avgArticleTimeMs?: number
  avgTokensPerArticle?: number
  maxArticles?: number
}): number {
  // Copy implementation from OPTIMIZATION_STRATEGY_DESIGN_B.md
}

export async function processNewsTopicsBatchAdaptive(
  supabase: AppSupabaseClient,
  news: Array<{ id: string; title: string; description: string | null }>,
  timeRemainingMs: number,
  maxConcurrency = 3
): Promise<TopicProcessResult[]> {
  // Copy implementation from OPTIMIZATION_STRATEGY_DESIGN_B.md
}

// In fetch-feeds/route.ts:
const startTime = Date.now()
// ... do feed fetching and matching ...
const elapsedMs = Date.now() - startTime
const timeRemainingMs = maxDuration * 1000 - elapsedMs

const topicResults = await processNewsTopicsBatchAdaptive(
  supabase,
  recentNews.data,
  timeRemainingMs,
  3
)
```

---

## Change 5: Token Pre-check

**Target File**: `src/lib/openai-resilient-client.ts`
**Effort**: 10 minutes
**Gain**: 0.2 seconds

### Checklist

- [ ] Add `canAffordBatch()` method to OpenAIResilientClient
- [ ] Add `maxBatchSize()` method
- [ ] (Optional) Use in topic-processor.ts before processing batch
- [ ] Test: Verify methods return correct values

### Code Template

```typescript
// In OpenAIResilientClient class, add:

public canAffordBatch(itemCount: number, avgTokensPerItem: number): boolean {
  const requiredTokens = itemCount * avgTokensPerItem
  return this.tokenBudget.canAfford(requiredTokens)
}

public maxBatchSize(avgTokensPerItem: number, maxItems: number = 50): number {
  const headroom = this.tokenBudget.getHeadroom()
  return Math.min(maxItems, Math.floor(headroom / avgTokensPerItem))
}

// Optional: Use in topic processor
if (!resilientClient.canAffordBatch(articles.length, 200)) {
  console.log('Skipping batch - insufficient token budget')
  return []
}
```

---

## Testing & Validation

### Unit Tests

```bash
# Run each test independently
npm test -- semaphore.test.ts
npm test -- crisis-detector-aggregation.test.ts
npm test -- projection-optimization.test.ts
npm test -- adaptive-batch.test.ts
npm test -- openai-resilient-client.test.ts
```

### Integration Tests

```bash
npm test -- news-matcher-semaphore.test.ts
npm test -- end-to-end-optimization.test.ts
```

### Performance Benchmarks

```bash
npm test -- design-b-gains.test.ts
# Expected output:
# News matching: 6-8s (was 8-12s) ✓
# Crisis detection: 0.5-1.5s (was 2-4s) ✓
# Topic processing: 4-6s (was 5-8s) ✓
```

---

## Deployment Order

### Stage 1: Database & Core Changes (30 min)

1. Create and test migration for crisis aggregation RPC
2. Deploy migration to Supabase
3. Verify RPC exists: `SELECT * FROM noticias.count_crisis_matches_aggregated(...)`

### Stage 2: Service Layer Changes (90 min)

4. Create semaphore utility
5. Update news-matcher.ts
6. Update crisis-detector.ts
7. Update jsonb-search.ts
8. Update topic-processor.ts
9. Update fetch-feeds/route.ts
10. Run all unit & integration tests

### Stage 3: Verification (30 min)

11. Deploy to staging
12. Run 10 cron cycles, monitor metrics
13. Check logs for optimization markers
14. Deploy to production
15. Monitor production for 24 hours

---

## Rollback Commands

### Individual Change Rollback

```bash
# Revert only one change
git revert --no-edit <commit-hash>

# Or revert file to previous state
git checkout HEAD~1 -- src/services/news-matcher.ts

# Or manually revert:
# - Semaphore: Use old Promise.allSettled()
# - Aggregation: Call old detectCrisesForAllClients()
# - Projections: Remove projection parameter, use '*'
# - Adaptive: Use fixed batch size (50)
# - Pre-check: Ignore batch affordability method
```

### Database Rollback

```bash
# Drop RPC function if aggregation fails
supabase db push --dry-run  # See what would change
supabase migration down     # Revert last migration
```

---

## Key Metrics to Monitor

After deploying each change, verify:

```
Change 1 (Semaphore):
✓ Filter matching time: 6-8s (was 8-12s)
✓ Semaphore permits available: 2-5 (not 0)
✓ Connection pool utilization: < 80%

Change 2 (Aggregation):
✓ Crisis detection time: 0.5-1.5s (was 2-4s)
✓ RPC call count: 1 (not 20+)
✓ Query plan: Uses index on matched_at

Change 3 (Projection):
✓ Projection type: 'matching' for filters, 'display' for UI
✓ Payload size: ~5KB per article (was ~50KB)
✓ Network time: ~50ms (was ~200ms)

Change 4 (Adaptive):
✓ Batch size: 20-40 articles (was fixed 50)
✓ Time remaining: > 10s safety margin
✓ Articles processed: Increases when time available

Change 5 (Pre-check):
✓ Token budget headroom: > avgTokensPerItem
✓ Batch affordability: PASS before processing
```

---

## Quick Reference: Before/After Times

```
Pipeline: 22-38s → 14-28s (8-10s improvement)

Component timing:
- Feed fetch:          5-8s (unchanged)
- Filter matching:     8-12s → 6-8s (-2-3s semaphore)
- Crisis detection:    2-4s → 0.5-1.5s (-2-3s aggregation)
- Topic processing:    5-8s → 4-6s (-1-2s adaptive batching)
- Projections:         0s → -0.5-1s (selective loading)
- Token pre-check:     0s → -0.2s (batch affordability)
- Other:               1-2s (unchanged)
```

---

## Common Issues & Solutions

### Issue: Semaphore appears stuck

**Symptom**: Filters still processing after 20 seconds
**Solution**: Check if `processBatchWithSemaphore()` properly releases permits
- Verify `finally` block executes
- Check error handling doesn't break permit release

### Issue: Aggregation RPC not found

**Symptom**: `Function count_crisis_matches_aggregated not found`
**Solution**: 
- Verify migration ran: `supabase db status`
- Check function exists: `select * from information_schema.routines where routine_name = 'count_crisis_matches_aggregated'`
- Rerun migration: `supabase db push --force-reset`

### Issue: Adaptive batch size = 0

**Symptom**: No articles processed, error about insufficient time
**Solution**:
- Check `timeRemainingMs` is correctly calculated
- Increase safety margin from 10s to 15s if timing tight
- Verify token budget not exhausted from other sources

### Issue: Projection returns undefined fields

**Symptom**: Error when accessing `news.description` after using 'matching' projection
**Solution**:
- Don't access fields not in projection
- Use 'analysis' or 'display' projection if need those fields
- Check calling code expectations before projection

---

## Success Criteria

✅ Design B is successfully implemented when:

1. **Performance**: Pipeline time improved by 5-8 seconds (measure over 10 runs)
2. **Reliability**: All tests pass (unit, integration, performance)
3. **Compatibility**: Old API functions still work (backward compatible)
4. **Monitoring**: All optimization metrics logged and visible
5. **Deployment**: Each change deployed independently, no combined failures
6. **Rollback**: Any change can be reverted in < 5 minutes

---

## Timeline

- **Day 1**: Implement & test locally (2 hours)
- **Day 2**: Deploy to staging, monitor (1 hour)
- **Day 3**: Deploy to production, monitor 24h (1 hour active + 24h passive)

Total effort: ~3 hours active work
