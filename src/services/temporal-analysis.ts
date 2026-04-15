import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface DailyStats {
  date: string
  total_news: number
  positive_sentiment: number
  neutral_sentiment: number
  negative_sentiment: number
  themes_mentioned: number
}

export interface ThemeTimeline {
  date: string
  [themeName: string]: number | string
}

export interface SentimentTrend {
  date: string
  positive: number
  neutral: number
  negative: number
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

    // Agrupar por data
    const grouped = new Map<string, { news: string[]; sentiments: string[] }>()

    const { data: topicsData } = await supabase
      .schema('noticias')
      .from('news_topics')
      .select('news_id, sentiment')
      .in(
        'news_id',
        newsData.map((n) => n.id)
      )

    for (const news of newsData) {
      const date = new Date(news.published_at || news.id).toISOString().split('T')[0]

      if (!grouped.has(date)) {
        grouped.set(date, { news: [], sentiments: [] })
      }

      const entry = grouped.get(date)!
      entry.news.push(news.id)
    }

    // Adicionar sentimentos
    if (topicsData) {
      for (const topic of topicsData) {
        for (const [date, data] of grouped.entries()) {
          if (data.news.includes(topic.news_id)) {
            if (topic.sentiment) {
              data.sentiments.push(topic.sentiment)
            }
          }
        }
      }
    }

    // Converter para formato de gráfico
    const result: DailyStats[] = []
    for (const [date, data] of grouped.entries()) {
      result.push({
        date,
        total_news: data.news.length,
        positive_sentiment: data.sentiments.filter((s) => s === 'positive').length,
        neutral_sentiment: data.sentiments.filter((s) => s === 'neutral').length,
        negative_sentiment: data.sentiments.filter((s) => s === 'negative').length,
        themes_mentioned: data.news.length, // Simplificado
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
 * Analisa tendência de sentimento ao longo do tempo
 */
export async function getSentimentTrend(
  supabase: AppSupabaseClient,
  dateFrom: string,
  dateTo: string
): Promise<SentimentTrend[]> {
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
      .select('news_id, sentiment, extracted_at')
      .in(
        'news_id',
        newsData.map((n) => n.id)
      )

    // Agrupar por data e sentimento
    const grouped = new Map<
      string,
      { positive: number; neutral: number; negative: number }
    >()

    if (topicsData) {
      for (const topic of topicsData) {
        const date = new Date(topic.extracted_at).toISOString().split('T')[0]

        if (!grouped.has(date)) {
          grouped.set(date, { positive: 0, neutral: 0, negative: 0 })
        }

        const entry = grouped.get(date)!
        if (topic.sentiment === 'positive') entry.positive++
        else if (topic.sentiment === 'neutral') entry.neutral++
        else if (topic.sentiment === 'negative') entry.negative++
      }
    }

    // Converter para formato de gráfico
    const result: SentimentTrend[] = []
    for (const [date, data] of grouped.entries()) {
      result.push({
        date,
        ...data,
      })
    }

    return result.sort((a, b) => a.date.localeCompare(b.date))
  } catch (error) {
    console.error('[TemporalAnalysis] Erro ao buscar tendência de sentimento:', error)
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
