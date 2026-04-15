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

    const results: ClientCrisisStatus[] = []

    for (const client of clients) {
      // Buscar temas do cliente
      const { data: themes } = await supabase
        .schema('noticias')
        .from('client_themes')
        .select('id')
        .eq('client_id', client.id)
        .eq('status', 'active')

      // Buscar crises ativas
      const { data: crises } = await supabase
        .schema('noticias')
        .from('crisis_alerts')
        .select('*')
        .eq('client_id', client.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(5)

      // Encontrar tema com maior severidade
      let topCritical = undefined
      if (crises && crises.length > 0) {
        const critical = crises.find((c) => c.severity === 'critical')
        if (critical) {
          // Buscar nome do tema
          const { data: theme } = await supabase
            .schema('noticias')
            .from('global_themes')
            .select('name')
            .eq('id', critical.theme_id)
            .single()

          topCritical = theme?.name
        }
      }

      results.push({
        client_id: client.id,
        client_name: client.name,
        total_themes: themes?.length || 0,
        active_crises: crises?.length || 0,
        recent_alerts: crises || [],
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
