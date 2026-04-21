import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface GlobalThemeStats {
  theme_id: string
  theme_name: string
  mention_count: number
  trending: boolean
  recent_spike: boolean
}

export interface TopTrendingTheme {
  name: string
  mention_count: number
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
    const rows = await paginateRows<{ category: string | null }>(
      () =>
        supabase
          .schema('noticias')
          .from('news_topics')
          .select('category')
          .gte('extracted_at', sinceDate),
      { context: 'TopGlobalThemes' },
    )

    if (rows.length === 0) return []

    // Agrupa por categoria
    const map = new Map<string, number>()
    for (const r of rows) {
      const cat = (r.category || 'outros').toLowerCase().trim()
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }

    const sorted = [...map.entries()]
      .map(([cat, count]) => ({ cat, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    const withSpikes = await Promise.all(
      sorted.map(async (s) => {
        const spike = await detectCategorySpike(supabase, s.cat)
        return {
          theme_id: s.cat,
          theme_name: capitalize(s.cat),
          mention_count: s.count,
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
 * Gera recomendações baseadas em crescimento de volume (trending).
 * Compara últimos 7 dias com os 7 anteriores: categoria que mais cresceu em
 * volume absoluto aparece no topo. Sem ranking por sentimento — só volume.
 */
export async function getCampaignRecommendations(
  supabase: AppSupabaseClient,
  limit = 5
): Promise<
  Array<{
    theme: string
    opportunity_score: number
    reason: string
  }>
> {
  try {
    const now = Date.now()
    const recentSince = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    const priorSince = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()

    const { paginateRows } = await import('@/lib/supabase/paginate')

    const [recentRows, priorRows] = await Promise.all([
      paginateRows<{ category: string | null }>(
        () =>
          supabase
            .schema('noticias')
            .from('news_topics')
            .select('category')
            .gte('extracted_at', recentSince),
        { context: 'Recommendations.recent' },
      ),
      paginateRows<{ category: string | null }>(
        () =>
          supabase
            .schema('noticias')
            .from('news_topics')
            .select('category')
            .gte('extracted_at', priorSince)
            .lt('extracted_at', recentSince),
        { context: 'Recommendations.prior' },
      ),
    ])

    if (recentRows.length === 0) return []

    const countByCategory = (rows: Array<{ category: string | null }>) => {
      const map = new Map<string, number>()
      for (const r of rows) {
        const cat = (r.category || 'outros').toLowerCase().trim()
        map.set(cat, (map.get(cat) ?? 0) + 1)
      }
      return map
    }

    const recent = countByCategory(recentRows)
    const prior = countByCategory(priorRows)

    const recommendations = [...recent.entries()]
      .map(([cat, recentCount]) => {
        const priorCount = prior.get(cat) ?? 0
        const growth = recentCount - priorCount
        const ratio = priorCount > 0 ? recentCount / priorCount : recentCount
        const reason =
          priorCount === 0
            ? 'Tema novo — surgiu nos últimos 7 dias'
            : ratio >= 2
              ? `Volume ${ratio.toFixed(1)}x maior que na semana anterior`
              : growth > 0
                ? `Crescimento de ${growth} menções em 7 dias`
                : 'Tema com volume relevante'

        return {
          theme: capitalize(cat),
          opportunity_score: recentCount,
          reason,
          _growth: growth,
        }
      })
      .sort((a, b) => b._growth - a._growth || b.opportunity_score - a.opportunity_score)
      .slice(0, limit)
      .map(({ _growth, ...rest }) => rest)

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
      media_coverage_trend: 'stable',
    }
  } catch (error) {
    console.error('[StrategistInsights] Erro ao calcular KPIs:', error)
    return {
      total_unique_themes: 0,
      global_crises: 0,
      media_coverage_trend: 'stable',
    }
  }
}
