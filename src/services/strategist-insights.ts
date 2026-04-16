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
 * Busca top categorias globais agregando `news_topics.category`.
 *
 * Usa o campo `category` genérico extraído pelo OpenAI (economia,
 * política, saúde, tecnologia, esportes, outros) em vez dos tópicos
 * granulares de `topic_mentions` — pra manter a visão estratégica em
 * alto nível (dezenas de notícias por categoria, não centenas de
 * tópicos com 1-2 menções cada).
 */
export async function getTopGlobalThemes(
  supabase: AppSupabaseClient,
  limit = 10,
  daysBack = 7
): Promise<GlobalThemeStats[]> {
  try {
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()

    const { paginateRows } = await import('@/lib/supabase/paginate')
    const rows = await paginateRows<{ category: string | null; sentiment: string | null }>(
      () =>
        supabase
          .schema('noticias')
          .from('news_topics')
          .select('category, sentiment')
          .gte('extracted_at', sinceDate),
      { context: 'TopGlobalThemes' },
    )

    if (rows.length === 0) return []

    // Agrupa por categoria
    const map = new Map<string, { count: number; positive: number; neutral: number; negative: number }>()
    for (const r of rows) {
      const cat = (r.category || 'outros').toLowerCase().trim()
      const entry = map.get(cat) ?? { count: 0, positive: 0, neutral: 0, negative: 0 }
      entry.count++
      if (r.sentiment === 'positive') entry.positive++
      else if (r.sentiment === 'neutral') entry.neutral++
      else if (r.sentiment === 'negative') entry.negative++
      map.set(cat, entry)
    }

    const sorted = [...map.entries()]
      .map(([cat, stats]) => ({ cat, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    const withSpikes = await Promise.all(
      sorted.map(async (s) => {
        const spike = await detectCategorySpike(supabase, s.cat)
        return {
          theme_id: s.cat,
          theme_name: capitalize(s.cat),
          mention_count: s.count,
          sentiment_distribution: { positive: s.positive, neutral: s.neutral, negative: s.negative },
          trending: s.count > 10,
          recent_spike: spike,
        } as GlobalThemeStats
      }),
    )

    return withSpikes
  } catch (error) {
    console.error('[StrategistInsights] Erro ao buscar temas globais:', error)
    return []
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Spike detection por categoria (em vez de topic_name).
 */
async function detectCategorySpike(
  supabase: AppSupabaseClient,
  category: string,
): Promise<boolean> {
  const now = Date.now()
  const recentSince = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
  const priorSince = new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString()
  const priorUntil = recentSince

  const [recent, prior] = await Promise.all([
    supabase
      .schema('noticias')
      .from('news_topics')
      .select('id', { count: 'exact', head: true })
      .ilike('category', category)
      .gte('extracted_at', recentSince),
    supabase
      .schema('noticias')
      .from('news_topics')
      .select('id', { count: 'exact', head: true })
      .ilike('category', category)
      .gte('extracted_at', priorSince)
      .lt('extracted_at', priorUntil),
  ])

  const recentCount = recent.count ?? 0
  const priorCount = prior.count ?? 0

  return recentCount >= 5 && recentCount >= 2 * Math.max(priorCount, 1)
}

/**
 * Calcula visão geral de sentimento usando count exato por categoria.
 * Evita o cap de 1000 rows do PostgREST (antes, buscávamos todas as rows
 * e contávamos no JS, o que truncava o total em 1000).
 */
export async function getSentimentOverview(
  supabase: AppSupabaseClient,
  daysBack = 7
): Promise<SentimentOverview> {
  try {
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()

    const buildCount = (sentiment: 'positive' | 'neutral' | 'negative') =>
      supabase
        .schema('noticias')
        .from('news_topics')
        .select('id', { count: 'exact', head: true })
        .gte('extracted_at', sinceDate)
        .eq('sentiment', sentiment)

    const [{ count: pos }, { count: neu }, { count: neg }] = await Promise.all([
      buildCount('positive'),
      buildCount('neutral'),
      buildCount('negative'),
    ])

    const positive = pos ?? 0
    const neutral = neu ?? 0
    const negative = neg ?? 0
    const total = positive + neutral + negative

    if (total === 0) {
      return { positive_percentage: 0, neutral_percentage: 0, negative_percentage: 0, total_news: 0 }
    }

    return {
      positive_percentage: Math.round((positive / total) * 100),
      neutral_percentage: Math.round((neutral / total) * 100),
      negative_percentage: Math.round((negative / total) * 100),
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
    const themeNames = [...themeMap.values()]

    // Contar clientes que monitoram cada tema (match por name em client_themes)
    const clientCountByTheme = new Map<string, number>()
    if (themeNames.length > 0) {
      const { data: clientThemes } = await supabase
        .schema('noticias')
        .from('client_themes')
        .select('name, client_id')
        .in('name', themeNames)
        .eq('status', 'active')

      const seen = new Map<string, Set<string>>()
      for (const ct of clientThemes ?? []) {
        const set = seen.get(ct.name) ?? new Set<string>()
        set.add(ct.client_id)
        seen.set(ct.name, set)
      }
      for (const [name, clientSet] of seen) {
        clientCountByTheme.set(name, clientSet.size)
      }
    }

    return crises.map((c) => {
      const themeName = themeMap.get(c.theme_id) || 'Unknown'
      return {
        theme_name: themeName,
        client_count: clientCountByTheme.get(themeName) ?? 0,
        severity: c.severity,
      }
    })
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
export async function getStrategistKPIs(supabase: AppSupabaseClient, daysBack = 7): Promise<{
  total_unique_themes: number
  global_crises: number
  sentiment_trend: 'improving' | 'worsening' | 'stable'
  media_coverage_trend: 'up' | 'down' | 'stable'
}> {
  try {
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()

    // Conta temas únicos mencionados nos últimos N dias via topic_mentions.
    const { paginateRows } = await import('@/lib/supabase/paginate')
    const rows = await paginateRows<{ topic_name: string }>(
      () =>
        supabase
          .schema('noticias')
          .from('topic_mentions')
          .select('topic_name')
          .gte('mentioned_at', sinceDate),
      { context: 'StrategistKPIs.uniqueThemes' },
    )
    const uniqueThemes = new Set<string>(rows.map((r) => r.topic_name))

    const { count: globalCrisesCount } = await supabase
      .schema('noticias')
      .from('crisis_alerts')
      .select('id', { count: 'exact', head: true })
      .is('ended_at', null)
      .is('client_id', null)

    return {
      total_unique_themes: uniqueThemes.size,
      global_crises: globalCrisesCount ?? 0,
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
