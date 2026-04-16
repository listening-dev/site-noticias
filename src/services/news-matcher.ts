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

/**
 * Regra arquitetural (Y estrito, pós-migration 011-013):
 *
 *   Notícia entra em client_news se, e somente se:
 *     - match ≥ 1 booleana ativa do cliente
 *     - AND (cliente não tem client_sources) OU (fonte da notícia ∈ client_sources)
 *
 * Cliente sem nenhum client_filters ativo não recebe nenhuma notícia.
 * Não existe mais o caminho "source-linked sem booleana".
 */
export async function matchNewsForAllClients(
  supabase: AppSupabaseClient,
  sinceHours = 24,
): Promise<MatchResult[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()

  const [{ data: filters, error: filtersError }, sourceMap] = await Promise.all([
    supabase.schema('noticias').from('client_filters').select('*').eq('active', true),
    loadClientSourceMap(supabase),
  ])

  if (filtersError || !filters) {
    console.error('[Matcher] Erro ao buscar filtros:', filtersError)
    return []
  }

  const maxConcurrency = Math.min(10, Math.max(5, filters.length / 10))

  try {
    const filterResults = await processBatchWithSemaphore(
      filters,
      (filter: ClientFilter) =>
        matchFilter(supabase, filter, since, sourceMap.get(filter.client_id) ?? null),
      maxConcurrency,
      {
        onProgress: (completed, total) => {
          if (completed % 10 === 0) {
            console.log(
              `[Matcher] Processed ${completed}/${total} filters with concurrency=${maxConcurrency}`,
            )
          }
        },
      },
    )

    return filterResults.filter((r): r is MatchResult => r !== null)
  } catch (error) {
    console.error('[Matcher] Error processing filters with semaphore:', error)
    return []
  }
}

/**
 * Reprocessa client_news de um cliente específico apagando e recriando
 * matches dentro de uma janela de tempo.
 *
 * Usado pelo endpoint POST /api/admin/clientes/[id]/reprocessar após
 * edição de booleanas, para garantir consistência entre a regra salva
 * e os matches armazenados.
 */
export async function reprocessClient(
  supabase: AppSupabaseClient,
  clientId: string,
  windowDays: number,
  filterId?: string,
): Promise<{ deleted: number; matched: number; filters: number }> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: sourceRows }, filtersResult] = await Promise.all([
    supabase.schema('noticias').from('client_sources').select('source_id').eq('client_id', clientId),
    (() => {
      let q = supabase
        .schema('noticias')
        .from('client_filters')
        .select('*')
        .eq('client_id', clientId)
        .eq('active', true)
      if (filterId) q = q.eq('id', filterId)
      return q
    })(),
  ])

  const sourceIds = (sourceRows ?? []).map((s: any) => s.source_id as string)
  const filters = (filtersResult.data ?? []) as ClientFilter[]

  if (filters.length === 0) {
    return { deleted: 0, matched: 0, filters: 0 }
  }

  let deleteQuery = supabase
    .schema('noticias')
    .from('client_news')
    .delete({ count: 'exact' })
    .eq('client_id', clientId)
    .gte('matched_at', since)
  if (filterId) deleteQuery = deleteQuery.eq('filter_id', filterId)

  const { count: deleted } = await deleteQuery

  const results = await Promise.all(
    filters.map((f) => matchFilter(supabase, f, since, sourceIds.length > 0 ? sourceIds : null)),
  )
  const matched = results.reduce((acc, r) => acc + r.matched, 0)

  return { deleted: deleted ?? 0, matched, filters: filters.length }
}

async function loadClientSourceMap(
  supabase: AppSupabaseClient,
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .schema('noticias')
    .from('client_sources')
    .select('client_id, source_id')

  const map = new Map<string, string[]>()
  if (error || !data) return map

  for (const row of data) {
    const arr = map.get(row.client_id) ?? []
    arr.push(row.source_id)
    map.set(row.client_id, arr)
  }
  return map
}

async function matchFilter(
  supabase: AppSupabaseClient,
  filter: ClientFilter,
  since: string,
  sourceIds: string[] | null,
): Promise<MatchResult> {
  const tsquery = filter.tsquery_value || booleanQueryToTsquery(filter.boolean_query)

  if (!tsquery) {
    return { client_id: filter.client_id, filter_id: filter.id, matched: 0 }
  }

  const matchedNews = await matchNewsByTsquery(supabase, tsquery, since, sourceIds)

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
