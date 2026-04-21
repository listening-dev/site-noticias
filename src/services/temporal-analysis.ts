import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface DailyStats {
  date: string
  total_news: number
  themes_mentioned: number
}

export interface ThemeTimeline {
  date: string
  [themeName: string]: number | string
}

export interface CategoryVolume {
  category: string
  count: number
}

export interface TopThemeInPeriod {
  topic_name: string
  mention_count: number
}

/**
 * Analisa distribuição de notícias por dia no período
 */
export async function getTemporalDistribution(
  supabase: AppSupabaseClient,
  dateFrom: string,
  dateTo: string
): Promise<DailyStats[]> {
  try {
    const { data: newsData } = await supabase
      .schema('noticias')
      .from('news')
      .select('id, published_at')
      .gte('published_at', dateFrom)
      .lte('published_at', dateTo)
      .order('published_at', { ascending: true })

    if (!newsData || newsData.length === 0) {
      return []
    }

    const grouped = new Map<string, number>()
    for (const news of newsData) {
      const date = new Date(news.published_at || news.id).toISOString().split('T')[0]
      grouped.set(date, (grouped.get(date) ?? 0) + 1)
    }

    const result: DailyStats[] = []
    for (const [date, count] of grouped.entries()) {
      result.push({
        date,
        total_news: count,
        themes_mentioned: count, // Simplificado
      })
    }

    return result.sort((a, b) => a.date.localeCompare(b.date))
  } catch (error) {
    console.error('[TemporalAnalysis] Erro ao buscar distribuição:', error)
    return []
  }
}

/**
 * Rastreia evolução de um tema específico ao longo do tempo
 */
export async function getThemeTimeline(
  supabase: AppSupabaseClient,
  themeName: string,
  dateFrom: string,
  dateTo: string
): Promise<ThemeTimeline[]> {
  try {
    const { data: newsData } = await supabase
      .schema('noticias')
      .from('news')
      .select('id, published_at')
      .gte('published_at', dateFrom)
      .lte('published_at', dateTo)

    if (!newsData || newsData.length === 0) {
      return []
    }

    const { data: topicsData } = await supabase
      .schema('noticias')
      .from('news_topics')
      .select('news_id, topics, extracted_at')
      .in(
        'news_id',
        newsData.map((n) => n.id)
      )

    // Filtrar por tema específico
    const grouped = new Map<string, number>()

    if (topicsData) {
      for (const topicRecord of topicsData) {
        if (topicRecord.topics && Array.isArray(topicRecord.topics)) {
          const hasTheme = (topicRecord.topics as any[]).some(
            (t) => t.name && t.name.toLowerCase().includes(themeName.toLowerCase())
          )

          if (hasTheme) {
            const date = new Date(topicRecord.extracted_at).toISOString().split('T')[0]
            grouped.set(date, (grouped.get(date) || 0) + 1)
          }
        }
      }
    }

    // Converter para timeline
    const result: ThemeTimeline[] = []
    for (const [date, count] of grouped.entries()) {
      result.push({
        date,
        [themeName]: count,
      })
    }

    return result.sort((a, b) => a.date.localeCompare(b.date))
  } catch (error) {
    console.error('[TemporalAnalysis] Erro ao buscar timeline do tema:', error)
    return []
  }
}

/**
 * Volume de notícias por categoria no período.
 */
export async function getCategoryDistribution(
  supabase: AppSupabaseClient,
  dateFrom: string,
  dateTo: string,
  limit = 10
): Promise<CategoryVolume[]> {
  try {
    const { paginateRows } = await import('@/lib/supabase/paginate')
    const rows = await paginateRows<{ category: string | null }>(
      () =>
        supabase
          .schema('noticias')
          .from('news_topics')
          .select('category')
          .gte('extracted_at', dateFrom)
          .lte('extracted_at', dateTo),
      { context: 'CategoryDistribution' },
    )

    if (rows.length === 0) return []

    const map = new Map<string, number>()
    for (const r of rows) {
      const cat = (r.category || 'outros').toLowerCase().trim()
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }

    return [...map.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  } catch (error) {
    console.error('[TemporalAnalysis] Erro ao buscar distribuição por categoria:', error)
    return []
  }
}

/**
 * Tópicos mais mencionados no período, via tabela denormalizada topic_mentions.
 */
export async function getTopThemesInPeriod(
  supabase: AppSupabaseClient,
  dateFrom: string,
  dateTo: string,
  limit = 10
): Promise<TopThemeInPeriod[]> {
  try {
    const { paginateRows } = await import('@/lib/supabase/paginate')
    const rows = await paginateRows<{ topic_name: string }>(
      () =>
        supabase
          .schema('noticias')
          .from('topic_mentions')
          .select('topic_name')
          .gte('mentioned_at', dateFrom)
          .lte('mentioned_at', dateTo),
      { context: 'TopThemesInPeriod' },
    )

    if (rows.length === 0) return []

    const map = new Map<string, number>()
    for (const r of rows) {
      if (!r.topic_name) continue
      map.set(r.topic_name, (map.get(r.topic_name) ?? 0) + 1)
    }

    return [...map.entries()]
      .map(([topic_name, mention_count]) => ({ topic_name, mention_count }))
      .sort((a, b) => b.mention_count - a.mention_count)
      .slice(0, limit)
  } catch (error) {
    console.error('[TemporalAnalysis] Erro ao buscar top temas:', error)
    return []
  }
}

/**
 * Detecta picos de notícias (momentos de maior atividade)
 */
export async function detectSpikes(
  data: DailyStats[],
  threshold = 1.5
): Promise<Array<{ date: string; spike_factor: number }>> {
  if (data.length === 0) return []

  const average = data.reduce((sum, d) => sum + d.total_news, 0) / data.length
  const spikes = data
    .map((d) => ({
      date: d.date,
      spike_factor: d.total_news / average,
    }))
    .filter((s) => s.spike_factor >= threshold)

  return spikes
}
