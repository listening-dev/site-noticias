import { SupabaseClient } from '@supabase/supabase-js'
import { Database, NewsWithTopics } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface AdvancedSearchFilters {
  // Busca por texto
  query?: string

  // Filtros por período
  dateFrom?: string
  dateTo?: string

  // Filtro por cliente (Analista vê múltiplos)
  clientIds?: string[]

  // Filtro por tema/tópico
  themes?: string[]
  topicNames?: string[]

  // Filtro por sentimento
  sentiment?: 'positive' | 'neutral' | 'negative'

  // Filtro por categoria
  categories?: string[]

  // Filtro por fonte
  sourceIds?: string[]

  // Paginação
  page?: number
  pageSize?: number

  // Ordenação
  sortBy?: 'relevance' | 'recent' | 'trending'
}

export interface SearchResult {
  id: string
  title: string
  description: string | null
  url: string
  published_at: string | null
  created_at: string
  source_id: string | null
  category: string | null
  sources?: {
    id: string
    name: string
    category: string | null
  }
  news_topics?: {
    topics: Array<{ name: string; confidence: number; category?: string }> | null
    entities: Array<{ name: string; type: string }> | null
    sentiment: string | null
    category: string | null
  }
}

/**
 * Resposta de busca avançada com contagens precisas
 * - totalCount: contagem PRÉ pós-filtros (do Supabase)
 * - filteredCount: contagem PÓS pós-filtros (o que user vê)
 * - hasMore: dica se há próxima página
 */
export interface AdvancedSearchResponse {
  data: SearchResult[]
  totalCount: number       // Count PRÉ pós-filtros (sempre correto)
  filteredCount: number    // Count PÓS pós-filtros (o que user vê)
  hasMore: boolean         // Dica: há próxima página?
  error?: string
}

/**
 * Busca avançada de notícias com múltiplos filtros
 *
 * Design 3: Interface simples para 95% dos casos, com trade-offs documentados
 *
 * @param supabase - Cliente Supabase
 * @param filters - Filtros de busca (período, texto, cliente, sentimento, etc)
 * @param userId - ID do usuário autenticado
 * @returns Notícias + contagens precisas + hint de paginação
 *
 * @example
 * const { data, totalCount, filteredCount, hasMore } = await advancedSearch(
 *   supabase,
 *   { query: 'inflação', clientIds: ['cli_123'], sentiment: 'negative' },
 *   userId
 * )
 */
export async function advancedSearch(
  supabase: AppSupabaseClient,
  filters: AdvancedSearchFilters,
  userId: string
): Promise<AdvancedSearchResponse> {
  try {
    const {
      query,
      dateFrom,
      dateTo,
      clientIds,
      themes,
      topicNames,
      sentiment,
      categories,
      sourceIds,
      page = 1,
      pageSize = 20,
      sortBy = 'recent',
    } = filters

    // Validações
    const validPage = Math.max(1, page || 1)
    const validPageSize = Math.min(100, Math.max(5, pageSize || 20))
    const rangeFrom = (validPage - 1) * validPageSize
    const rangeTo = rangeFrom + validPageSize - 1

    // ====================================================================
    // ETAPA 1: PRÉ-PROCESSAMENTO — Filtros no Supabase (DB-friendly)
    // ====================================================================

    let newsQuery = supabase
      .schema('noticias')
      .from('news')
      .select('*, sources(*), news_topics(*)', { count: 'exact' })

    // Período (padrão: últimos 7 dias)
    const to = dateTo ? new Date(dateTo) : new Date()
    const from = dateFrom ? new Date(dateFrom) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)

    newsQuery = newsQuery
      .gte('published_at', from.toISOString())
      .lte('published_at', to.toISOString())

    // Texto (full-text search)
    if (query && query.trim()) {
      newsQuery = newsQuery.textSearch('search_vector', query.trim(), { type: 'websearch' })
    }

    // Fontes
    if (sourceIds && sourceIds.length > 0) {
      newsQuery = newsQuery.in('source_id', sourceIds)
    }

    // Categorias
    if (categories && categories.length > 0) {
      newsQuery = newsQuery.in('category', categories)
    }

    // Ordenação PRÉ-paginação (será ajustada se trending)
    if (sortBy === 'recent' || sortBy === 'relevance') {
      newsQuery = newsQuery.order('published_at', { ascending: false })
    } else if (sortBy === 'trending') {
      // Trending: vai ser reordenado pós-fetch com base em mentions
      newsQuery = newsQuery.order('published_at', { ascending: false })
    }

    // Paginação
    newsQuery = newsQuery.range(rangeFrom, rangeTo)

    const { data: news, count: totalCount, error: newsError } = await newsQuery

    if (newsError || !news) {
      console.error('[AdvancedSearch] Erro ao buscar notícias:', newsError)
      return {
        data: [],
        totalCount: 0,
        filteredCount: 0,
        hasMore: false,
        error: newsError?.message
      }
    }

    // ====================================================================
    // ETAPA 2: PÓS-PROCESSAMENTO — Filtros em app-level
    // ====================================================================

    let filtered = [...news] as SearchResult[]

    // Filtro por clientes
    if (clientIds && clientIds.length > 0) {
      const { data: clientNewsList } = await supabase
        .schema('noticias')
        .from('client_news')
        .select('news_id')
        .in('client_id', clientIds)
        .gte('matched_at', from.toISOString())
        .lte('matched_at', to.toISOString())

      const allowedNewsIds = new Set(clientNewsList?.map((cn) => cn.news_id) ?? [])
      filtered = filtered.filter((n) => allowedNewsIds.has(n.id))
    }

    // Filtro por tópicos (usa tabela denormalizada topic_mentions para performance)
    if (topicNames && topicNames.length > 0) {
      const { countRecentTopicMentions } = await import('./topic-search')

      // Buscar news_ids que mencionam cada tópico
      const allTopicNewsIds = new Set<string>()

      for (const topicName of topicNames) {
        const { data: mentions, error: mentionsError } = await supabase
          .schema('noticias')
          .from('topic_mentions')
          .select('news_id')
          .eq('topic_name', topicName)
          .gte('mentioned_at', from.toISOString())
          .lte('mentioned_at', to.toISOString())

        if (!mentionsError && mentions) {
          mentions.forEach((m: any) => allTopicNewsIds.add(m.news_id))
        }
      }

      // Manter apenas notícias que mencionam algum dos tópicos
      filtered = filtered.filter((n) => allTopicNewsIds.has(n.id))
    }

    // Filtro por sentimento
    if (sentiment) {
      filtered = filtered.filter((n) => n.news_topics?.sentiment === sentiment)
    }

    // ====================================================================
    // ETAPA 3: ORDENAÇÃO TRENDING (pós-filtros)
    // ====================================================================

    if (sortBy === 'trending') {
      filtered = await calculateTrendingSort(supabase, filtered, {
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
      })
    }

    // ====================================================================
    // ETAPA 4: RETORNO COM CONTAGENS PRECISAS
    // ====================================================================

    const filteredCount = filtered.length
    const finalTotalCount = totalCount ?? 0
    const hasMore = filteredCount > validPageSize

    return {
      data: filtered,
      totalCount: finalTotalCount,  // PRÉ pós-filtros (do Supabase)
      filteredCount,                // PÓS pós-filtros (o que user vê)
      hasMore,                      // Dica: há próxima página?
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[AdvancedSearch] Erro geral:', message)
    return {
      data: [],
      totalCount: 0,
      filteredCount: 0,
      hasMore: false,
      error: message
    }
  }
}

/**
 * Calcula trending sort baseado em frequência de menções em clientes
 * Trending = notícias mais mencionadas pelos clientes nos últimos dias
 *
 * @param supabase - Cliente Supabase
 * @param news - Notícias para ordenar
 * @param dateRange - Período de análise
 * @returns Notícias reordenadas por trending score
 */
async function calculateTrendingSort(
  supabase: AppSupabaseClient,
  news: SearchResult[],
  dateRange: { dateFrom: string; dateTo: string }
): Promise<SearchResult[]> {
  const newsIds = news.map((n) => n.id)
  if (newsIds.length === 0) return news

  try {
    // Buscar frequência de menções em client_news
    const { data: mentions } = await supabase
      .schema('noticias')
      .from('client_news')
      .select('news_id')
      .in('news_id', newsIds)
      .gte('matched_at', dateRange.dateFrom)
      .lte('matched_at', dateRange.dateTo)

    const mentionCount = new Map<string, number>()
    ;(mentions ?? []).forEach((m: any) => {
      mentionCount.set(m.news_id, (mentionCount.get(m.news_id) ?? 0) + 1)
    })

    // Reordenar por mention count DESC, depois por published_at DESC
    return news.sort((a, b) => {
      const countA = mentionCount.get(a.id) ?? 0
      const countB = mentionCount.get(b.id) ?? 0

      if (countA !== countB) {
        return countB - countA // Maior count primeiro
      }

      // Tie-break: mais recente primeiro
      const dateA = new Date(a.published_at || '').getTime()
      const dateB = new Date(b.published_at || '').getTime()
      return dateB - dateA
    })
  } catch (error) {
    console.error('[TrendingSort] Erro ao calcular trending, usando published_at:', error)
    // Fallback: ordenar por published_at
    return news.sort(
      (a, b) =>
        new Date(b.published_at || '').getTime() - new Date(a.published_at || '').getTime()
    )
  }
}

/**
 * Busca com auto-complete de temas/tópicos
 * Usado para sugerir termos enquanto o usuário digita
 */
export async function searchTopicsAutoComplete(
  supabase: AppSupabaseClient,
  query: string,
  limit = 5
): Promise<Array<{ name: string; type: 'global_theme' | 'topic' | 'entity' }>> {
  if (!query || query.length < 2) return []

  try {
    const results = []

    // 1. Buscar em global_themes
    const { data: globalThemes } = await supabase
      .schema('noticias')
      .from('global_themes')
      .select('name')
      .ilike('name', `%${query}%`)
      .eq('status', 'active')
      .limit(limit)

    if (globalThemes) {
      results.push(...globalThemes.map((t) => ({ name: t.name, type: 'global_theme' as const })))
    }

    // 2. Buscar tópicos únicos em topic_mentions (otimizado com índice)
    // Usa tabela denormalizada para O(log n) lookup com ILIKE
    const { data: mentionedTopics } = await supabase
      .schema('noticias')
      .from('topic_mentions')
      .select('topic_name')
      .ilike('topic_name', `%${query}%`)
      .order('topic_name')
      .limit(limit)

    if (mentionedTopics) {
      const uniqueTopics = new Set<string>()
      for (const mention of mentionedTopics) {
        if (mention.topic_name) {
          uniqueTopics.add(mention.topic_name)
        }
      }

      for (const topicName of Array.from(uniqueTopics)) {
        results.push({ name: topicName, type: 'topic' as const })
      }
    }

    return results.slice(0, limit)
  } catch (error) {
    console.error('[AutoComplete] Erro:', error)
    return []
  }
}

/**
 * Busca por tema específico
 * Retorna todas as notícias que mencionam esse tema
 */
export async function searchByTheme(
  supabase: AppSupabaseClient,
  themeName: string,
  dateFrom?: string,
  dateTo?: string,
  pageSize = 50
): Promise<SearchResult[]> {
  try {
    const to = dateTo ? new Date(dateTo) : new Date()
    const from = dateFrom ? new Date(dateFrom) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Import da função otimizada com denormalização
    const { searchByTopicOptimized } = await import('./topic-search')

    // 1. Buscar tema global (para referência apenas)
    const { data: theme } = await supabase
      .schema('noticias')
      .from('global_themes')
      .select('id')
      .eq('name', themeName)
      .single()

    if (!theme) {
      // Não é tema global, buscar por tópico usando função otimizada
      // Usa tabela denormalizada topic_mentions com índice O(log n)
      const news = await searchByTopicOptimized(
        supabase,
        themeName,
        from.toISOString(),
        to.toISOString(),
        pageSize
      )

      return (news as SearchResult[]) || []
    }

    // É tema global - buscar notícias que matcharam com esse tema
    const { data: newsIds } = await supabase
      .schema('noticias')
      .from('client_theme_matches')
      .select('news_id')
      .gte('matched_at', from.toISOString())
      .lte('matched_at', to.toISOString())

    if (!newsIds || newsIds.length === 0) return []

    const uniqueNewsIds = [...new Set(newsIds.map((ni) => ni.news_id))]

    const { data: news } = await supabase
      .schema('noticias')
      .from('news')
      .select('*, sources(*), news_topics(*)')
      .in('id', uniqueNewsIds)
      .order('published_at', { ascending: false })
      .limit(pageSize)

    return (news as SearchResult[]) || []
  } catch (error) {
    console.error('[SearchByTheme] Erro:', error)
    return []
  }
}
