import { SupabaseClient } from '@supabase/supabase-js'
import { Database, CrisisAlert, ClientTheme } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface ClientCrisisStatus {
  client_id: string
  client_name: string
  total_themes: number
  active_crises: number
  recent_alerts: CrisisAlert[]
  top_critical_theme?: string
}

export interface CrisisAlertWithTheme extends CrisisAlert {
  theme_name?: string
  client_name?: string
}

/**
 * Busca status de todos os clientes assignados ao Account Manager
 */
export async function getClientsCrisisStatus(
  supabase: AppSupabaseClient,
  userId: string
): Promise<ClientCrisisStatus[]> {
  try {
    // 1. Buscar clientes do usuário
    const { data: userClients } = await supabase
      .schema('noticias')
      .from('user_clients')
      .select('client_id')
      .eq('user_id', userId)

    if (!userClients || userClients.length === 0) {
      return []
    }

    const clientIds = userClients.map((uc) => uc.client_id)

    // 2. Buscar info de cada cliente
    const { data: clients } = await supabase
      .schema('noticias')
      .from('clients')
      .select('id, name')
      .in('id', clientIds)

    if (!clients || clients.length === 0) {
      return []
    }

    // [Optimization] Batch queries instead of N+1 loop
    // BEFORE: 1 + 1 + (10 × 3) = 31 queries for 10 clients
    // AFTER: 1 + 1 + 1 + 1 + 1 = 5 queries (parallel fetch)

    const results: ClientCrisisStatus[] = []
    const clientIdList = clients.map((c) => c.id)

    // Batch Query 1: All themes for all clients
    const { data: allThemes } = await supabase
      .schema('noticias')
      .from('client_themes')
      .select('client_id, id')
      .in('client_id', clientIdList)
      .eq('status', 'active')

    // Batch Query 2: All active crises for all clients
    const { data: allCrises } = await supabase
      .schema('noticias')
      .from('crisis_alerts')
      .select('*')
      .in('client_id', clientIdList)
      .is('ended_at', null)
      .order('started_at', { ascending: false })

    // Batch Query 3: All global themes (for crisis enrichment)
    const crisisThemeIds = [...new Set((allCrises || []).map((c) => c.theme_id).filter(Boolean))]
    const { data: globalThemes } = await supabase
      .schema('noticias')
      .from('global_themes')
      .select('id, name')
      .in('id', crisisThemeIds)

    // In-memory aggregation (no more DB calls)
    const themesByClient = new Map<string, string[]>()
    ;(allThemes || []).forEach((t: any) => {
      const existing = themesByClient.get(t.client_id) ?? []
      existing.push(t.id)
      themesByClient.set(t.client_id, existing)
    })

    const crisesByClient = new Map<string, any[]>()
    ;(allCrises || []).forEach((c: any) => {
      const existing = crisesByClient.get(c.client_id) ?? []
      existing.push(c)
      crisesByClient.set(c.client_id, existing)
    })

    const themeMap = new Map((globalThemes || []).map((t: any) => [t.id, t.name]))

    // Build results from batched data
    for (const client of clients) {
      const clientThemes = themesByClient.get(client.id) ?? []
      const clientCrises = (crisesByClient.get(client.id) ?? []).slice(0, 5) // Limit to 5 most recent

      let topCritical = undefined
      if (clientCrises.length > 0) {
        const critical = clientCrises.find((c) => c.severity === 'critical')
        if (critical) {
          topCritical = themeMap.get(critical.theme_id)
        }
      }

      results.push({
        client_id: client.id,
        client_name: client.name,
        total_themes: clientThemes.length,
        active_crises: clientCrises.length,
        recent_alerts: clientCrises,
        top_critical_theme: topCritical,
      })
    }

    // Ordenar por número de crises ativas (descendente)
    return results.sort((a, b) => b.active_crises - a.active_crises)
  } catch (error) {
    console.error('[AccountManager] Erro ao buscar status de clientes:', error)
    return []
  }
}

/**
 * Busca alertas recentes para todos os clientes do Account Manager
 */
export async function getRecentAlerts(
  supabase: AppSupabaseClient,
  userId: string,
  hoursBack = 24
): Promise<CrisisAlertWithTheme[]> {
  try {
    // 1. Buscar clientes do usuário
    const { data: userClients } = await supabase
      .schema('noticias')
      .from('user_clients')
      .select('client_id')
      .eq('user_id', userId)

    if (!userClients || userClients.length === 0) {
      return []
    }

    const clientIds = userClients.map((uc) => uc.client_id)

    // 2. Buscar crises recentes
    const sinceTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

    const { data: crises } = await supabase
      .schema('noticias')
      .from('crisis_alerts')
      .select('*')
      .in('client_id', clientIds)
      .gte('created_at', sinceTime)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!crises || crises.length === 0) {
      return []
    }

    // 3. Enriquecer com nomes de tema e cliente
    const themeIds = [...new Set(crises.map((c) => c.theme_id))]
    const { data: themes } = await supabase
      .schema('noticias')
      .from('global_themes')
      .select('id, name')
      .in('id', themeIds)

    const { data: clients } = await supabase
      .schema('noticias')
      .from('clients')
      .select('id, name')
      .in('id', clientIds)

    const themeMap = new Map(themes?.map((t) => [t.id, t.name]) || [])
    const clientMap = new Map(clients?.map((c) => [c.id, c.name]) || [])

    return crises.map((c) => ({
      ...c,
      theme_name: themeMap.get(c.theme_id),
      client_name: c.client_id ? clientMap.get(c.client_id) : 'Global',
    })) as CrisisAlertWithTheme[]
  } catch (error) {
    console.error('[AccountManager] Erro ao buscar alertas recentes:', error)
    return []
  }
}

/**
 * Descarta um alerta de crise
 */
export async function dismissCrisisAlert(
  supabase: AppSupabaseClient,
  alertId: string,
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .schema('noticias')
      .from('crisis_alerts')
      .update({
        dismissed_by: userId,
        dismissed_at: new Date().toISOString(),
      })
      .eq('id', alertId)

    if (error) {
      console.error('[AccountManager] Erro ao descartar alerta:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('[AccountManager] Erro geral ao descartar alerta:', error)
    return false
  }
}

/**
 * Calcula KPIs agregados
 */
export async function getAccountManagerKPIs(
  supabase: AppSupabaseClient,
  userId: string
): Promise<{
  total_clients: number
  total_active_crises: number
  critical_crises: number
  high_crises: number
}> {
  try {
    const statuses = await getClientsCrisisStatus(supabase, userId)

    const allAlerts = statuses.flatMap((s) => s.recent_alerts)
    const criticalCount = allAlerts.filter((a) => a.severity === 'critical').length
    const highCount = allAlerts.filter((a) => a.severity === 'high').length
    const activeCrisisCount = statuses.reduce((sum, s) => sum + s.active_crises, 0)

    return {
      total_clients: statuses.length,
      total_active_crises: activeCrisisCount,
      critical_crises: criticalCount,
      high_crises: highCount,
    }
  } catch (error) {
    console.error('[AccountManager] Erro ao calcular KPIs:', error)
    return {
      total_clients: 0,
      total_active_crises: 0,
      critical_crises: 0,
      high_crises: 0,
    }
  }
}
