import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface CrisisDetectionResult {
  theme_id: string
  client_id: string | null
  severity: 'low' | 'medium' | 'high' | 'critical'
  matched_count: number
  alert_created: boolean
}

/**
 * Detecta crises baseado em:
 * - Quantidade de notícias matchadas em um período
 * - Threshold específico do tema
 */
export async function detectCrisesForClientTheme(
  supabase: AppSupabaseClient,
  clientId: string,
  themeId: string,
  thresholdCount: number = 5,
  timeWindowMinutes: number = 60
): Promise<CrisisDetectionResult | null> {
  try {
    const sinceTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString()

    // 1. Contar notícias matchadas com este tema nos últimos N minutos
    const { data: matches, error: matchError } = await supabase
      .schema('noticias')
      .from('client_theme_matches')
      .select('id')
      .eq('client_id', clientId)
      .eq('theme_id', themeId)
      .gte('matched_at', sinceTime)

    if (matchError || !matches) {
      console.error('[CrisisDetector] Erro ao contar matches:', matchError)
      return null
    }

    const matchedCount = matches.length

    // 2. Se passou do threshold, criar ou atualizar alerta
    if (matchedCount >= thresholdCount) {
      // Determinar severidade
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
      if (matchedCount >= thresholdCount * 3) severity = 'critical'
      else if (matchedCount >= thresholdCount * 2) severity = 'high'
      else if (matchedCount >= thresholdCount * 1.5) severity = 'medium'

      // 3. Verificar se já existe alerta ativo
      const { data: existingAlert } = await supabase
        .schema('noticias')
        .from('crisis_alerts')
        .select('id, matched_count')
        .eq('theme_id', themeId)
        .eq('client_id', clientId)
        .is('ended_at', null)
        .single()

      if (existingAlert) {
        // Atualizar contagem do alerta existente
        await supabase
          .schema('noticias')
          .from('crisis_alerts')
          .update({
            matched_count: matchedCount,
            severity,
          })
          .eq('id', existingAlert.id)

        return {
          theme_id: themeId,
          client_id: clientId,
          severity,
          matched_count: matchedCount,
          alert_created: false, // Já existia
        }
      } else {
        // Criar novo alerta
        const { error: insertError } = await supabase
          .schema('noticias')
          .from('crisis_alerts')
          .insert({
            theme_id: themeId,
            client_id: clientId,
            severity,
            matched_count: matchedCount,
            started_at: new Date().toISOString(),
          })

        if (insertError) {
          console.error('[CrisisDetector] Erro ao criar alerta:', insertError)
          return null
        }

        return {
          theme_id: themeId,
          client_id: clientId,
          severity,
          matched_count: matchedCount,
          alert_created: true,
        }
      }
    } else {
      // Se havia alerta antes, fechá-lo
      await supabase
        .schema('noticias')
        .from('crisis_alerts')
        .update({
          ended_at: new Date().toISOString(),
        })
        .eq('theme_id', themeId)
        .eq('client_id', clientId)
        .is('ended_at', null)

      return null
    }
  } catch (error) {
    console.error('[CrisisDetector] Erro geral na detecção de crise:', error)
    return null
  }
}

/**
 * Detecta crises para TODOS os temas de um cliente
 */
export async function detectCrisesForAllClientThemes(
  supabase: AppSupabaseClient,
  clientId: string,
  timeWindowMinutes: number = 60
): Promise<CrisisDetectionResult[]> {
  try {
    // 1. Buscar temas ativos do cliente
    const { data: themes } = await supabase
      .schema('noticias')
      .from('client_themes')
      .select('id, crisis_threshold')
      .eq('client_id', clientId)
      .eq('status', 'active')

    if (!themes || themes.length === 0) {
      return []
    }

    // 2. Detectar crise para cada tema em paralelo
    const results = await Promise.allSettled(
      themes.map((theme) =>
        detectCrisesForClientTheme(
          supabase,
          clientId,
          theme.id,
          theme.crisis_threshold || 5,
          timeWindowMinutes
        )
      )
    )

    return results
      .filter((r): r is PromiseFulfilledResult<CrisisDetectionResult | null> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((r): r is CrisisDetectionResult => r !== null)
  } catch (error) {
    console.error('[CrisisDetector] Erro ao detectar crises para cliente:', error)
    return []
  }
}

/**
 * Detecta crises para TODOS os clientes
 */
export async function detectCrisesForAllClients(
  supabase: AppSupabaseClient,
  timeWindowMinutes: number = 60
): Promise<CrisisDetectionResult[]> {
  try {
    // 1. Buscar todos os clientes
    const { data: clients } = await supabase
      .schema('noticias')
      .from('clients')
      .select('id')

    if (!clients || clients.length === 0) {
      return []
    }

    // 2. Detectar crises para cada cliente em paralelo
    const allResults = await Promise.allSettled(
      clients.map((client) => detectCrisesForAllClientThemes(supabase, client.id, timeWindowMinutes))
    )

    return allResults
      .filter((r): r is PromiseFulfilledResult<CrisisDetectionResult[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
  } catch (error) {
    console.error('[CrisisDetector] Erro ao detectar crises globais:', error)
    return []
  }
}

/**
 * Detecta crises GLOBAIS (temas sem referência a cliente)
 */
export async function detectGlobalCrises(
  supabase: AppSupabaseClient,
  timeWindowMinutes: number = 60
): Promise<CrisisDetectionResult[]> {
  try {
    const sinceTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString()

    // 1. Buscar temas globais ativos
    const { data: globalThemes } = await supabase
      .schema('noticias')
      .from('global_themes')
      .select('id, name')
      .eq('status', 'active')

    if (!globalThemes || globalThemes.length === 0) {
      return []
    }

    const results: CrisisDetectionResult[] = []

    // Import da função otimizada com denormalização
    const { countRecentTopicMentions } = await import('./topic-search')

    for (const theme of globalThemes) {
      // Contar menções recentes usando tabela denormalizada (O(log n) com índice)
      const matchCount = await countRecentTopicMentions(supabase, theme.name, timeWindowMinutes)

      const globalThreshold = 10

      if (matchCount >= globalThreshold) {
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
        if (matchCount >= globalThreshold * 3) severity = 'critical'
        else if (matchCount >= globalThreshold * 2) severity = 'high'
        else if (matchCount >= globalThreshold * 1.5) severity = 'medium'

        results.push({
          theme_id: theme.id,
          client_id: null, // Crise global
          severity,
          matched_count: matchCount,
          alert_created: true,
        })
      }
    }

    return results
  } catch (error) {
    console.error('[CrisisDetector] Erro ao detectar crises globais:', error)
    return []
  }
}
