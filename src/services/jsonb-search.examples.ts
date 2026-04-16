/**
 * EXEMPLOS DE USO: jsonb-search.ts
 *
 * Este arquivo documenta padrões de uso recomendados.
 * NÃO é importado em produção, apenas para referência.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  findNewsByTopicName,
  findNewsByTopicNameWithDetails,
  matchNewsByTsquery,
  validateAndMatchByTsquery,
  validateTsquery,
} from './jsonb-search'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

// ============================================================================
// EXEMPLO 1: Crisis Detector — Buscar por topic name
// ============================================================================

/**
 * Código anterior (BUGADO):
 *
 * const { data: topicMatches } = await supabase
 *   .schema('noticias')
 *   .from('news_topics')
 *   .select('id', { count: 'exact' })
 *   .gte('extracted_at', sinceTime)
 *   .filter('topics', 'ilike', `%${theme.id}%`) // ← BUG: busca UUID em vez de name!
 *
 * Resultado: sempre 0 matches → crises nunca disparam
 */

export async function detectGlobalCrises_Example(
  supabase: AppSupabaseClient,
  timeWindowMinutes: number = 60
) {
  const sinceTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString()
  const toTime = new Date().toISOString()

  // 1. Buscar temas globais ativos
  const { data: globalThemes } = await supabase
    .schema('noticias')
    .from('global_themes')
    .select('id, name')
    .eq('status', 'active')

  if (!globalThemes || globalThemes.length === 0) {
    return []
  }

  const results = []

  // 2. Para CADA TEMA, buscar notícias
  for (const theme of globalThemes) {
    // ✅ CORRETO: Busca por theme.name (não theme.id!)
    const topicMatches = await findNewsByTopicName(supabase, theme.name, {
      dateRange: {
        from: sinceTime,
        to: toTime,
      },
      idsOnly: true, // Se só precisa de IDs
      limit: 1000,
    })

    const matchCount = topicMatches.length
    const globalThreshold = 10

    if (matchCount >= globalThreshold) {
      // Cria alerta, etc...
      results.push({
        theme_id: theme.id,
        matched_count: matchCount,
        severity: matchCount > 30 ? 'critical' : 'high',
      })
    }
  }

  return results
}

// ============================================================================
// EXEMPLO 2: Strategist Insights — Loop de temas com contagens
// ============================================================================

/**
 * Código anterior (INEFICIENTE):
 *
 * const { data: newsTopics } = await supabase
 *   .schema('noticias')
 *   .from('news_topics')
 *   .select('sentiment')
 *   .gte('extracted_at', sinceDate)
 *   .filter('topics', 'ilike', `%"name":"${theme.name}"%`)
 *
 * for (const theme of themes) { // ← N+1 queries!
 *   // buscar topicMatches
 * }
 *
 * Problema: O(n) queries, cada uma é full-scan se falta índice GIN
 */

export async function getTopGlobalThemes_Example(
  supabase: AppSupabaseClient,
  limit = 10,
  daysBack = 7
) {
  const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()
  const toDate = new Date().toISOString()

  // 1. Buscar temas
  const { data: themes } = await supabase
    .schema('noticias')
    .from('global_themes')
    .select('id, name')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (!themes || themes.length === 0) {
    return []
  }

  const results = []

  // 2. Para cada tema, buscar mentões + sentimento
  for (const theme of themes) {
    // ✅ CORRETO: Centralizado, com índice GIN, com dateRange
    const topicResults = await findNewsByTopicName(supabase, theme.name, {
      dateRange: {
        from: sinceDate,
        to: toDate,
      },
      idsOnly: false, // Pega registros completos (com sentiment)
      limit: 1000,
    })

    if (!topicResults || topicResults.length === 0) continue

    // Agora buscar dados de sentimento
    const newsIds = topicResults.map((t: any) => t.news_id)
    const { data: newsTopicsData } = await supabase
      .schema('noticias')
      .from('news_topics')
      .select('sentiment')
      .in('news_id', newsIds)

    if (!newsTopicsData) continue

    const sentiments = {
      positive: newsTopicsData.filter((nt) => nt.sentiment === 'positive').length,
      neutral: newsTopicsData.filter((nt) => nt.sentiment === 'neutral').length,
      negative: newsTopicsData.filter((nt) => nt.sentiment === 'negative').length,
    }

    results.push({
      theme_id: theme.id,
      theme_name: theme.name,
      mention_count: topicResults.length,
      sentiment_distribution: sentiments,
    })
  }

  return results.sort((a, b) => b.mention_count - a.mention_count).slice(0, limit)
}

// ============================================================================
// EXEMPLO 3: Advanced Search — Buscar notícias completas por tema
// ============================================================================

/**
 * Código anterior:
 *
 * const { data: newsWithTopic } = await supabase
 *   .schema('noticias')
 *   .from('news_topics')
 *   .select('news_id')
 *   .gte('extracted_at', from.toISOString())
 *   .lte('extracted_at', to.toISOString())
 *   .filter('topics', 'ilike', `%"name":"${themeName}"%`)
 *
 * const newsIds = newsWithTopic.map((nt) => nt.news_id)
 *
 * const { data: news } = await supabase
 *   .schema('noticias')
 *   .from('news')
 *   .select('*, sources(*), news_topics(*)')
 *   .in('id', newsIds)
 *
 * Problema: 2 queries, lógica espalhada
 */

export async function searchByTheme_Example(
  supabase: AppSupabaseClient,
  themeName: string,
  dateFrom?: string,
  dateTo?: string,
  pageSize = 50
) {
  const to = dateTo ? new Date(dateTo) : new Date()
  const from = dateFrom ? new Date(dateFrom) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

  // ✅ CORRETO: Uma função que retorna notícias completas
  const news = await findNewsByTopicNameWithDetails(supabase, themeName, {
    dateRange: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    limit: pageSize,
  })

  // news já vem com sources, news_topics, etc. Pronto para renderizar.
  return news
}

// ============================================================================
// EXEMPLO 4: News Matcher — Validar e executar tsquery
// ============================================================================

/**
 * Código anterior (BUGADO):
 *
 * const tsquery = filter.tsquery_value || booleanQueryToTsquery(filter.boolean_query)
 *
 * if (!tsquery) {
 *   return { client_id: filter.client_id, filter_id: filter.id, matched: 0 }
 * }
 *
 * const { data: matchedNews, error } = await supabase
 *   .schema('noticias')
 *   .rpc('match_news_by_tsquery', {
 *     tsquery_text: tsquery, // ← Pode ser inválido!
 *     since_date: since,
 *   })
 *
 * if (error || !matchedNews) {
 *   console.error(`[Matcher] Erro...`, error) // ← Erro silencioso
 *   return { client_id: filter.client_id, filter_id: filter.id, matched: 0 }
 * }
 *
 * Problema: Error handling pobre, tsquery não é validada
 */

export async function matchFilter_Example(supabase: AppSupabaseClient, filter: any, since: string) {
  // Implementar lógica que converte boolean_query para tsquery
  const { booleanQueryToTsquery } = await import('./boolean-search')
  const tsquery = filter.tsquery_value || booleanQueryToTsquery(filter.boolean_query)

  if (!tsquery) {
    return { client_id: filter.client_id, filter_id: filter.id, matched: 0 }
  }

  // ✅ CORRETO: Usar função consolidada com validação
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

// ============================================================================
// EXEMPLO 5: Diagnosticar tsquery com validação detalhada
// ============================================================================

export async function diagnoseQuery_Example(supabase: AppSupabaseClient) {
  // Cenário 1: Tsquery válida
  console.log('\n=== Cenário 1: Tsquery válida ===')
  const result1 = await validateAndMatchByTsquery(supabase, "'inflação' & 'banco'", '2026-04-14T00:00:00Z')
  console.log('Resultado:', result1)
  // Output: { valid: true, matched: 42, tsquery: "'inflação' & 'banco'" }

  // Cenário 2: Tsquery inválida (parênteses desbalanceados)
  console.log('\n=== Cenário 2: Tsquery inválida ===')
  const result2 = await validateAndMatchByTsquery(supabase, "'inflação' & ('banco'", '2026-04-14T00:00:00Z')
  console.log('Resultado:', result2)
  // Output: { valid: false, error: "Parênteses desbalanceados", matched: 0 }

  // Cenário 3: Validação pura (sem RPC)
  console.log('\n=== Cenário 3: Validação pura ===')
  const validation = validateTsquery("'governo' | 'estado' & 'saúde'")
  console.log('Válida?', validation.valid)
  console.log('Normalizada:', validation.normalized)
  // Output: { valid: true, normalized: "'governo' | 'estado' & 'saúde'" }
}

// ============================================================================
// EXEMPLO 6: Paginação em Topic Search
// ============================================================================

export async function searchTopicsPaginated_Example(
  supabase: AppSupabaseClient,
  topicName: string,
  page: number = 1,
  pageSize: number = 20
) {
  const offset = (page - 1) * pageSize

  // Busca com limite + contagem total
  const allMatches = await findNewsByTopicName(supabase, topicName, {
    limit: offset + pageSize, // Busca até fim desta página
    idsOnly: true,
  })

  if (!allMatches || allMatches.length === 0) {
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      hasMore: false,
    }
  }

  const sliced = allMatches.slice(offset, offset + pageSize)
  const newsIds = sliced.map((m: any) => m.news_id)

  // Buscar dados completos
  const { data: news } = await supabase
    .schema('noticias')
    .from('news')
    .select('*, sources(*), news_topics(*)')
    .in('id', newsIds)
    .order('published_at', { ascending: false })

  return {
    data: news || [],
    total: allMatches.length,
    page,
    pageSize,
    hasMore: offset + pageSize < allMatches.length,
  }
}

// ============================================================================
// EXEMPLO 7: Benchmark — Comparar performance
// ============================================================================

export async function benchmarkTopicSearch_Example(
  supabase: AppSupabaseClient,
  topicName: string
) {
  console.log(`\n=== Benchmarking: findNewsByTopicName("${topicName}") ===\n`)

  const start = performance.now()
  const results = await findNewsByTopicName(supabase, topicName, {
    idsOnly: true,
    limit: 1000,
  })
  const end = performance.now()

  console.log(`⏱️  Tempo: ${(end - start).toFixed(2)}ms`)
  console.log(`📊 Resultados: ${results.length}`)

  // Se lento (> 500ms), considerar:
  // 1. Índice GIN existe? EXPLAIN ANALYZE SELECT ... WHERE topics ILIKE ...
  // 2. Denormalizar topics em coluna TEXT[]
  if (end - start > 500) {
    console.warn('⚠️  Query lenta! Considere denormalização ou índices adicionais.')
  }

  return results
}
