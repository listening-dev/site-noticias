import { SupabaseClient } from '@supabase/supabase-js'
import { booleanQueryToTsquery } from './boolean-search'
import { Database, ClientFilter } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface MatchResult {
  client_id: string
  filter_id: string
  matched: number
}

export async function matchNewsForAllClients(supabase: AppSupabaseClient, sinceHours = 24): Promise<MatchResult[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()

  const { data: filters, error } = await supabase
    .schema('noticias')
    .from('client_filters')
    .select('*')
    .eq('active', true)

  if (error || !filters) {
    console.error('[Matcher] Erro ao buscar filtros:', error)
    return []
  }

  const results = await Promise.allSettled(
    filters.map((filter: ClientFilter) => matchFilter(supabase, filter, since))
  )

  return results
    .filter((r): r is PromiseFulfilledResult<MatchResult> => r.status === 'fulfilled')
    .map((r) => r.value)
}

async function matchFilter(supabase: AppSupabaseClient, filter: ClientFilter, since: string): Promise<MatchResult> {
  const tsquery = filter.tsquery_value || booleanQueryToTsquery(filter.boolean_query)

  if (!tsquery) {
    return { client_id: filter.client_id, filter_id: filter.id, matched: 0 }
  }

  const { data: matchedNews, error } = await supabase
    .schema('noticias')
    .from('news')
    .select('id')
    .gte('published_at', since)
    .textSearch('search_vector', tsquery, { type: 'websearch' })

  if (error || !matchedNews) {
    console.error(`[Matcher] Erro ao buscar notícias para filtro ${filter.id}:`, error)
    return { client_id: filter.client_id, filter_id: filter.id, matched: 0 }
  }

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
