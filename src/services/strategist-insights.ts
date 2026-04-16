import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface GlobalThemeStats {
  theme_id: string
  theme_name: string
  mention_count: number
  sentiment_distribution: {
    positive: number
    neutral: number
    negative: number
  }
  trending: boolean
  recent_spike: boolean
}

export interface SentimentOverview {
  positive_percentage: number
  neutral_percentage: number
  negative_percentage: number
  total_news: number
}

export interface TopTrendingTheme {
  name: string
  mention_count: number
  sentiment: 'positive' | 'neutral' | 'negative'
  trend_direction: 'up' | 'down' | 'stable'
}

/**
 * Busca top N temas globais mais mencionados
 */
export async function getTopGlobalThemes(
  supabase: AppSupabaseClient,
  limit = 10,
  daysBadck = 7
): Promise<GlobalThemeStats[]> {
  try {
    const sinceDate = new Date(Date.now() - daysBadck * 24 * 60 * 60 * 1000).toISOString()
    const toDate = new Date().toISOString()

    // 1. Buscar temas globais ativos
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

    const results: GlobalThemeStats[] = []

    // Import da função otimizada com denormalização
    const { getTopicStats } = await import('./topic-search')

    // 2. Para cada tema, contar menções e sentimento usando tabela denormalizada
    for (const theme of themes) {
      // Usar stats agregados da tabela denormalizada (O(log n) com índices)
      const stats = await getTopicStats(supabase, theme.name, sinceDate, toDate)

      if (!stats || stats.mention_count === 0) continue

      results.push({
        theme_id: theme.id,
        theme_name: theme.name,
        mention_count: stats.mention_count,
        sentiment_distribution: {
          positive: stats.positive,
          neutral: stats.neutral,
          negative: stats.negative,
        },
        trending: stats.mention_count > 10, // Simplificado
        recent_spike: false, // TODO: Implementar detecção de spike
      })
    }

    return results.sort((a, b) => b.mention_count - a.mention_count).slice(0, limit)
  } catch (error) {
    console.error('[StrategistInsights] Erro ao buscar temas globais:', error)
    return []
  }
}

/**
 * Calcula visão geral de sentimento
 */
export async function getSentimentOverview(
  supabase: AppSupabaseClient,
  daysBack = 7
): Promise<SentimentOverview> {
  try {
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()

    const { data: newsTopics } = await supabase
      .schema('noticias')
      .from('news_topics')
      .select('sentiment')
      .gte('extracted_at', sinceDate)

    if (!newsTopics || newsTopics.length === 0) {
      return {
        positive_percentage: 0,
        neutral_percentage: 0,
        negative_percentage: 0,
        total_news: 0,
      }
    }

    const total = newsTopics.length
    const sentiments = {
      positive: newsTopics.filter((nt) => nt.sentiment === 'positive').length,
      neutral: newsTopics.filter((nt) => nt.sentiment === 'neutral').length,
      negative: newsTopics.filter((nt) => nt.sentiment === 'negative').length,
    }

    return {
      positive_percentage: Math.round((sentiments.positive / total) * 100),
      neutral_percentage: Math.round((sentiments.neutral / total) * 100),
      negative_percentage: Math.round((sentiments.negative / total) * 100),
      total_news: total,
    }
  } catch (error) {
    console.error('[StrategistInsights] Erro ao calcular sentimento:', error)
    return {
      positive_percentage: 0,
      neutral_percentage: 0,
      negative_percentage: 0,
      total_news: 0,
    }
  }
}

/**
 * Detecta crises globais
 */
export async function getGlobalCrises(
  supabase: AppSupabaseClient,
  limit = 5
): Promise<Array<{ theme_name: string; client_count: number; severity: string }>> {
  try {
    const { data: crises } = await supabase
      .schema('noticias')
      .from('crisis_alerts')
      .select('theme_id, severity')
      .is('ended_at', null)
      .is('client_id', null)
      .order('severity', { ascending: false })
      .limit(limit)

    if (!crises || crises.length === 0) {
      return []
    }

    // Enriquecer com nomes de tema
    const themeIds = [...new Set(crises.map((c) => c.theme_id))]
    const { data: themes } = await supabase
      .schema('noticias')
      .from('global_themes')
      .select('id, name')
      .in('id', themeIds)

    const themeMap = new Map(themes?.map((t) => [t.id, t.name]) || [])

    return crises.map((c) => ({
      theme_name: themeMap.get(c.theme_id) || 'Unknown',
      client_count: 1, // Simplificado
      severity: c.severity,
    }))
  } catch (error) {
    console.error('[StrategistInsights] Erro ao buscar crises globais:', error)
    return []
  }
}

/**
 * Gera recomendações de campanha baseadas em trending topics
 */
export async function getCampaignRecommendations(
  supabase: AppSupabaseClient,
  limit = 5
): Promise<
  Array<{
    theme: string
    opportunity_score: number
    reason: string
    sentiment: string
  }>
> {
  try {
    const themes = await getTopGlobalThemes(supabase, 20, 7)
    const sentiment = await getSentimentOverview(supabase, 7)

    // Scoring simplificado: temas trending com sentimento positivo = boas oportunidades
    const recommendations = themes
      .map((t) => {
        const positiveSentiment = t.sentiment_distribution.positive
        const totalSentiment = Object.values(t.sentiment_distribution).reduce((a, b) => a + b, 0)
        const positivityRatio = totalSentiment > 0 ? positiveSentiment / totalSentiment : 0

        let reason = ''
        if (t.trending && positivityRatio > 0.6) {
          reason = 'Trending com sentimento altamente positivo'
        } else if (t.trending) {
          reason = 'Muito mencionado na mídia'
        } else if (positivityRatio > 0.7) {
          reason = 'Alto sentimento positivo'
        } else {
          reason = 'Tema relevante'
        }

        return {
          theme: t.theme_name,
          opportunity_score: t.mention_count * positivityRatio,
          reason,
          sentiment: positivityRatio > 0.6 ? 'positive' : positivityRatio > 0.4 ? 'neutral' : 'negative',
        }
      })
      .sort((a, b) => b.opportunity_score - a.opportunity_score)
      .slice(0, limit)

    return recommendations
  } catch (error) {
    console.error('[StrategistInsights] Erro ao gerar recomendações:', error)
    return []
  }
}

/**
 * Calcula KPIs estratégicos
 */
export async function getStrategistKPIs(supabase: AppSupabaseClient): Promise<{
  total_unique_themes: number
  global_crises: number
  sentiment_trend: 'improving' | 'worsening' | 'stable'
  media_coverage_trend: 'up' | 'down' | 'stable'
}> {
  try {
    const { data: themes } = await supabase
      .schema('noticias')
      .from('global_themes')
      .select('id')
      .eq('status', 'active')

    const { data: globalCrises } = await supabase
      .schema('noticias')
      .from('crisis_alerts')
      .select('id')
      .is('ended_at', null)
      .is('client_id', null)

    return {
      total_unique_themes: themes?.length || 0,
      global_crises: globalCrises?.length || 0,
      sentiment_trend: 'stable',
      media_coverage_trend: 'stable',
    }
  } catch (error) {
    console.error('[StrategistInsights] Erro ao calcular KPIs:', error)
    return {
      total_unique_themes: 0,
      global_crises: 0,
      sentiment_trend: 'stable',
      media_coverage_trend: 'stable',
    }
  }
}
