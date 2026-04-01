/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRssIngestionPipeline } from './rss-fetcher'
import { Source } from '@/lib/types/database'

export interface FeedFetchResult {
  source: string
  inserted: number
  errors: number
  status: 'ok' | 'empty' | 'error'
}

export async function fetchAllFeeds(supabase: any): Promise<FeedFetchResult[]> {
  const { data: sources, error } = await supabase
    .schema('noticias')
    .from('sources')
    .select('*')
    .eq('active', true)

  if (error || !sources) {
    console.error('[FeedFetcher] Erro ao buscar fontes:', error)
    return []
  }

  const pipeline = createRssIngestionPipeline()
  const outcomes = await pipeline.ingestAll(sources as Source[])

  const results: FeedFetchResult[] = []
  const BATCH_SIZE = 50

  for (const outcome of outcomes) {
    if (outcome.status === 'empty') {
      results.push({ source: outcome.source.name, inserted: 0, errors: 0, status: 'empty' })
      continue
    }

    if (outcome.status === 'error') {
      console.error(
        `[FeedFetcher] ${outcome.stage} error for "${outcome.source.name}": ${outcome.message}`
      )
      results.push({ source: outcome.source.name, inserted: 0, errors: 1, status: 'error' })
      continue
    }

    // status === 'ok'
    let inserted = 0
    for (let i = 0; i < outcome.items.length; i += BATCH_SIZE) {
      const batch = outcome.items.slice(i, i + BATCH_SIZE)
      const { error: upsertError, data } = await supabase
        .schema('noticias')
        .from('news')
        .upsert(batch, { onConflict: 'url', ignoreDuplicates: true })
        .select('id')

      if (upsertError) {
        console.error(`[FeedFetcher] Erro ao inserir lote de "${outcome.source.name}":`, upsertError)
      } else {
        inserted += data?.length ?? 0
      }
    }

    results.push({ source: outcome.source.name, inserted, errors: 0, status: 'ok' })
  }

  return results
}
