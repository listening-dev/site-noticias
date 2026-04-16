import { SupabaseClient } from '@supabase/supabase-js'
import { booleanQueryToTsquery } from './boolean-search'
import { matchNewsByTsquery } from './jsonb-search'
import { processBatchWithSemaphore } from '@/lib/concurrency-semaphore'
import { Database, ClientFilter } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface MatchResult {
  client_id: string
  filter_id: string
  matched: number
}

export async function matchNewsForAllClients(supabase: AppSupabaseClient, sinceHours = 24): Promise<MatchResult[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()

  // 1. Match por filtros booleanos
  const { data: filters, error } = await supabase
    .schema('noticias')
    .from('client_filters')
    .select('*')
    .eq('active', true)

  if (error || !filters) {
    console.error('[Matcher] Erro ao buscar filtros:', error)
    return []
  }

  // [Optimization #1] Use semaphore to control RPC concurrency (max 10 concurrent)
  // Prevents connection pool saturation with unbounded Promise.allSettled
  const results: MatchResult[] = []
  const maxConcurrency = Math.min(10, Math.max(5, filters.length / 10))

  try {
    const filterResults = await processBatchWithSemaphore(
      filters,
      (filter: ClientFilter) => matchFilter(supabase, filter, since),
      maxConcurrency,
      {
        onProgress: (completed, total) => {
          if (completed % 10 === 0) {
            console.log(`[Matcher] Processed ${completed}/${total} filters with concurrency=${maxConcurrency}`)
          }
        },
      }
    )

    results.push(...filterResults.filter((r): r is MatchResult => r !== null))
  } catch (error) {
    console.error('[Matcher] Error processing filters with semaphore:', error)
  }

  // 2. Match por fontes vinculadas (client_sources)
  const sourceResults = await matchByLinkedSources(supabase, since)
  results.push(...sourceResults)

  return results
}

async function matchFilter(supabase: AppSupabaseClient, filter: ClientFilter, since: string): Promise<MatchResult> {
  const tsquery = filter.tsquery_value || booleanQueryToTsquery(filter.boolean_query)

  if (!tsquery) {
    return { client_id: filter.client_id, filter_id: filter.id, matched: 0 }
  }

  // Usar função consolidada que valida tsquery antes de RPC
  const matchedNews = await matchNewsByTsquery(supabase, tsquery, since)

  if (matchedNews.length === 0) {
    return { client_id: filter.client_id, filter_id: filter.id, matched: 0 }
  }

  const records = matchedNews.map((n: { id: string }) => ({
    client_id: filter.client_id,
    news_id: n.id,
    filter_id: filter.id,
  }))

  const { error: insertError } = await supabase
    .schema('noticias')
    .from('client_news')
    .upsert(records, { onConflict: 'client_id,news_id', ignoreDuplicates: true })

  if (insertError) {
    console.error('[Matcher] Erro ao inserir client_news:', insertError)
  }

  return { client_id: filter.client_id, filter_id: filter.id, matched: matchedNews.length }
}

async function matchByLinkedSources(supabase: AppSupabaseClient, since: string): Promise<MatchResult[]> {
  // Buscar todas as associações client_sources
  const { data: clientSources, error } = await supabase
    .schema('noticias')
    .from('client_sources')
    .select('client_id, source_id')

  if (error || !clientSources || clientSources.length === 0) return []

  // Agrupar source_ids por client_id
  const clientSourceMap = new Map<string, string[]>()
  for (const cs of clientSources) {
    const existing = clientSourceMap.get(cs.client_id) ?? []
    existing.push(cs.source_id)
    clientSourceMap.set(cs.client_id, existing)
  }

  const results: MatchResult[] = []

  for (const [clientId, sourceIds] of clientSourceMap) {
    // Buscar notícias dessas fontes no período
    const { data: news, error: newsError } = await supabase
      .schema('noticias')
      .from('news')
      .select('id')
      .in('source_id', sourceIds)
      .gte('published_at', since)

    if (newsError || !news || news.length === 0) {
      results.push({ client_id: clientId, filter_id: 'source-linked', matched: 0 })
      continue
    }

    const records = news.map((n: { id: string }) => ({
      client_id: clientId,
      news_id: n.id,
      filter_id: null,
    }))

    const { error: insertError } = await supabase
      .schema('noticias')
      .from('client_news')
      .upsert(records, { onConflict: 'client_id,news_id', ignoreDuplicates: true })

    if (insertError) {
      console.error(`[Matcher] Erro ao inserir client_news para fontes vinculadas (client ${clientId}):`, insertError)
    }

    results.push({ client_id: clientId, filter_id: 'source-linked', matched: news.length })
  }

  return results
}
