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
 * Busca avançada de notícias com múltiplos filtros
 * Retorna notícias + tópicos + metadados
 */
export async function advancedSearch(
  supabase: AppSupabaseClient,
  filters: AdvancedSearchFilters,
  userId: string
): Promise<{ data: SearchResult[]; count: number; error?: string }> {
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

    const rangeFrom = (page - 1) * pageSize
    const rangeTo = rangeFrom + pageSize - 1

    // 1. Se há query de texto, busca com full-text search
    let newsQuery = supabase
      .schema('noticias')
      .from('news')
      .select('*, sources(*), news_topics(*)', { count: 'exact' })

    // 2. Filtro de período (padrão: últimos 7 dias)
    const to = dateTo ? new Date(dateTo) : new Date()
    const from = dateFrom ? new Date(dateFrom) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)

    newsQuery = newsQuery
      .gte('published_at', from.toISOString())
      .lte('published_at', to.toISOString())

    // 3. Filtro de texto (full-text search se houver)
    if (query && query.trim()) {
      newsQuery = newsQuery.textSearch('search_vector', query.trim(), { type: 'websearch' })
    }

    // 4. Filtro por fontes
    if (sourceIds && sourceIds.length > 0) {
      newsQuery = newsQuery.in('source_id', sourceIds)
    }

    // 5. Filtro por categorias
    if (categories && categories.length > 0) {
      newsQuery = newsQuery.in('category', categories)
    }

    // 6. Ordenação
    if (sortBy === 'recent') {
      newsQuery = newsQuery.order('published_at', { ascending: false })
    } else if (sortBy === 'trending') {
      // Trending = mais mencionado nos últimos dias
      // (simplificado: recentes com mais client_matches)
      newsQuery = newsQuery.order('published_at', { ascending: false })
    }

    // 7. Paginação
    newsQuery = newsQuery.range(rangeFrom, rangeTo)

    const { data: news, count, error: newsError } = await newsQuery

    if (newsError || !news) {
      console.error('[AdvancedSearch] Erro ao buscar notícias:', newsError)
      return { data: [], count: 0, error: newsError?.message }
    }

    // 8. Pós-processamento: Filtros que não podem ser feitos no Supabase
    let filtered = news as SearchResult[]

    // Filtro por tópicos (JSONB search no app-level se necessário)
    if (topicNames && topicNames.length > 0) {
      filtered = filtered.filter((n) => {
        if (!n.news_topics || !n.news_topics.topics) return false
        return (n.news_topics.topics as any[]).some((t) =>
          topicNames.some(
            (tn) => t.name && t.name.toLowerCase().includes(tn.toLowerCase())
          )
        )
      })
    }

    // Filtro por sentimento
    if (sentiment) {
      filtered = filtered.filter((n) => n.news_topics?.sentiment === sentiment)
    }

    // Filtro por clientes (se usuário não é admin)
    if (clientIds && clientIds.length > 0) {
      // TODO: Implementar filtro por client_theme_matches quando necessário
      // Por enquanto, retorna todas as notícias
    }

    return {
      data: filtered,
      count: filtered.length,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[AdvancedSearch] Erro geral:', message)
    return { data: [], count: 0, error: message }
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

    // 2. Buscar tópicos únicos em news_topics (simplificado)
    // Nota: Isso é O(n) no app. Ideal seria ter tabela denormalizada de tópicos únicos.
    const { data: newsTopics } = await supabase
      .schema('noticias')
      .from('news_topics')
      .select('topics')
      .limit(100) // Limitar scan

    if (newsTopics) {
      const uniqueTopics = new Set<string>()
      for (const nt of newsTopics) {
        if (nt.topics && Array.isArray(nt.topics)) {
          for (const t of nt.topics) {
            if (t.name && t.name.toLowerCase().includes(query.toLowerCase())) {
              uniqueTopics.add(t.name)
            }
          }
        }
      }

      for (const topicName of Array.from(uniqueTopics).slice(0, limit)) {
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

    // 1. Buscar tema global
    const { data: theme } = await supabase
      .schema('noticias')
      .from('global_themes')
      .select('id')
      .eq('name', themeName)
      .single()

    if (!theme) {
      // Não é tema global, buscar por tópico
      const { data: newsWithTopic } = await supabase
        .schema('noticias')
        .from('news_topics')
        .select('news_id')
        .gte('extracted_at', from.toISOString())
        .lte('extracted_at', to.toISOString())
        .filter('topics', 'ilike', `%"name":"${themeName}"%`) // JSONB contains

      if (!newsWithTopic || newsWithTopic.length === 0) return []

      const newsIds = newsWithTopic.map((nt) => nt.news_id)

      const { data: news } = await supabase
        .schema('noticias')
        .from('news')
        .select('*, sources(*), news_topics(*)')
        .in('id', newsIds)
        .order('published_at', { ascending: false })
        .limit(pageSize)

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
