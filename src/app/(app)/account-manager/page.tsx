'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Bell, Users, TrendingUp, Loader2, X, Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  getClientsCrisisStatus,
  getRecentAlerts,
  getAccountManagerKPIs,
  dismissCrisisAlert,
  ClientCrisisStatus,
  CrisisAlertWithTheme,
} from '@/services/account-manager'

export default function AccountManagerPage() {
  const [kpis, setKpis] = useState<{
    total_clients: number
    total_active_crises: number
    critical_crises: number
    high_crises: number
  }>({ total_clients: 0, total_active_crises: 0, critical_crises: 0, high_crises: 0 })

  const [clientsStatus, setClientsStatus] = useState<ClientCrisisStatus[]>([])
  const [recentAlerts, setRecentAlerts] = useState<CrisisAlertWithTheme[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) return

        const [kpisData, clientsData, alertsData] = await Promise.all([
          getAccountManagerKPIs(supabase, userData.user.id),
          getClientsCrisisStatus(supabase, userData.user.id),
          getRecentAlerts(supabase, userData.user.id, 24),
        ])

        setKpis(kpisData)
        setClientsStatus(clientsData)
        setRecentAlerts(alertsData)
      } catch (error) {
        console.error('Erro ao carregar dados:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleDismissAlert = async (alertId: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return

      const success = await dismissCrisisAlert(supabase, alertId, userData.user.id)
      if (success) {
        // Atualizar lista localmente
        setRecentAlerts(recentAlerts.filter((a) => a.id !== alertId))
      }
    } catch (error) {
      console.error('Erro ao descartar alerta:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Meus Clientes</h1>
        <p className="text-gray-600 mt-1">
          Monitore alertas de crises e status dos seus clientes
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Resumo rápido (KPIs) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard icon={<Users className="h-5 w-5" />} label="Clientes" value={String(kpis.total_clients)} />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
              label="Crises Ativas"
              value={String(kpis.total_active_crises)}
              color="red"
            />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5 text-orange-600" />}
              label="Críticas"
              value={String(kpis.critical_crises)}
              color="orange"
            />
            <StatCard
              icon={<AlertTriangle className="h-5 w-5 text-yellow-600" />}
              label="Altas"
              value={String(kpis.high_crises)}
              color="yellow"
            />
          </div>

          {/* Clientes com crises */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status dos Clientes</CardTitle>
              <CardDescription>Alertas e monitoramento de cada cliente</CardDescription>
            </CardHeader>
            <CardContent>
              {clientsStatus.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <Users className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                  <p className="text-gray-700 font-medium">Nenhum cliente assignado</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Você será notificado quando clientes forem assignados
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {clientsStatus.map((client) => (
                    <div
                      key={client.client_id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{client.client_name}</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {client.total_themes} tema{client.total_themes !== 1 ? 's' : ''} monitorado
                            {client.total_themes !== 1 ? 's' : ''}
                          </p>
                        </div>

                        {/* Status badge */}
                        {client.active_crises > 0 && (
                          <div className="text-right">
                            <Badge
                              className={`${
                                client.top_critical_theme
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {client.active_crises} crise{client.active_crises !== 1 ? 's' : ''} ativa
                              {client.active_crises !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        )}
                      </div>

                      {client.top_critical_theme && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                          <p className="text-sm text-red-800">
                            <strong>⚠️ Crise crítica em:</strong> {client.top_critical_theme}
                          </p>
                        </div>
                      )}

                      {/* Alertas recentes deste cliente */}
                      {client.recent_alerts.length > 0 && (
                        <div className="mt-3 text-xs text-gray-600">
                          <p className="font-medium mb-2">Alertas recentes:</p>
                          <div className="space-y-1">
                            {client.recent_alerts.slice(0, 2).map((alert) => (
                              <div key={alert.id} className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${
                                  alert.severity === 'critical' ? 'bg-red-600' :
                                  alert.severity === 'high' ? 'bg-orange-600' :
                                  alert.severity === 'medium' ? 'bg-yellow-600' : 'bg-gray-400'
                                }`} />
                                <span>{alert.matched_count} notícias</span>
                                <span>•</span>
                                <span className="capitalize">{alert.severity}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Histórico de alertas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Histórico de Alertas</CardTitle>
              <CardDescription>Últimas 24 horas</CardDescription>
            </CardHeader>
            <CardContent>
              {recentAlerts.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <Bell className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                  <p className="text-gray-700 font-medium">Sem alertas</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Tudo corre bem nos seus clientes
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {recentAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`border rounded-lg p-4 flex items-start justify-between ${
                        alert.severity === 'critical'
                          ? 'bg-red-50 border-red-200'
                          : alert.severity === 'high'
                            ? 'bg-orange-50 border-orange-200'
                            : 'bg-yellow-50 border-yellow-200'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle
                            className={`h-4 w-4 ${
                              alert.severity === 'critical'
                                ? 'text-red-600'
                                : alert.severity === 'high'
                                  ? 'text-orange-600'
                                  : 'text-yellow-600'
                            }`}
                          />
                          <span className="font-semibold text-sm text-gray-900">
                            {alert.client_name}
                          </span>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {alert.severity}
                          </Badge>
                        </div>

                        <p className="text-sm text-gray-700">
                          <strong>Tema:</strong> {alert.theme_name || 'N/A'}
                        </p>
                        <p className="text-sm text-gray-700">
                          <strong>Notícias:</strong> {alert.matched_count}
                        </p>

                        <div className="flex items-center gap-1 text-xs text-gray-600 mt-2">
                          <Clock className="h-3 w-3" />
                          {new Date(alert.started_at).toLocaleDateString('pt-BR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>

                      {!alert.dismissed_at && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDismissAlert(alert.id)}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color = 'blue',
}: {
  icon: React.ReactNode
  label: string
  value: string
  color?: string
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-700',
    orange: 'bg-orange-50 text-orange-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    green: 'bg-green-50 text-green-700',
  }

  return (
    <Card className={colorClasses[color as keyof typeof colorClasses]}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium opacity-75">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="text-2xl opacity-50">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
