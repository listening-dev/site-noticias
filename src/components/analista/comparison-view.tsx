'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

interface ComparisonViewProps {
  supabase: AppSupabaseClient
}

interface SentimentDist {
  positive: number
  neutral: number
  negative: number
}

interface ClientStats {
  client_id: string
  client_name: string
  total_matches: number
  top_themes: Array<{ name: string; count: number }>
  sentiment_distribution: SentimentDist
}

export function ComparisonView({ supabase }: ComparisonViewProps) {
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([])
  const [selectedClients, setSelectedClients] = useState<[string | null, string | null]>([null, null])
  const [stats, setStats] = useState<[ClientStats | null, ClientStats | null]>([null, null])
  const [loading, setLoading] = useState(false)

  // Carregar clientes disponíveis
  useEffect(() => {
    const loadClients = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) return

        // Buscar clientes do usuário
        const { data: userClients } = await supabase
          .schema('noticias')
          .from('user_clients')
          .select('client_id')
          .eq('user_id', userData.user.id)

        if (!userClients) return

        const clientIds = userClients.map((uc) => uc.client_id)

        const { data: clientsData } = await supabase
          .schema('noticias')
          .from('clients')
          .select('id, name')
          .in('id', clientIds)

        setClients(clientsData || [])
      } catch (error) {
        console.error('Erro ao carregar clientes:', error)
      }
    }

    loadClients()
  }, [])

  // Carregar estatísticas quando clientes são selecionados
  useEffect(() => {
    if (!selectedClients[0] && !selectedClients[1]) {
      setStats([null, null])
      return
    }

    const loadStats = async () => {
      setLoading(true)
      try {
        const newStats: [ClientStats | null, ClientStats | null] = [null, null]

        for (let i = 0; i < 2; i++) {
          if (!selectedClients[i]) continue

          const clientId = selectedClients[i]!

          // Buscar nome do cliente
          const { data: clientData } = await supabase
            .schema('noticias')
            .from('clients')
            .select('name')
            .eq('id', clientId)
            .single()

          // Buscar matches
          const { data: matches } = await supabase
            .schema('noticias')
            .from('client_theme_matches')
            .select('theme_id')
            .eq('client_id', clientId)
            .gte('matched_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

          // Buscar sentimento das notícias
          const { data: topics } = await supabase
            .schema('noticias')
            .from('news_topics')
            .select('sentiment')
            .gte('extracted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

          newStats[i] = {
            client_id: clientId,
            client_name: clientData?.name || 'Unknown',
            total_matches: matches?.length || 0,
            top_themes: [], // Simplificado
            sentiment_distribution: {
              positive: topics?.filter((t) => t.sentiment === 'positive').length || 0,
              neutral: topics?.filter((t) => t.sentiment === 'neutral').length || 0,
              negative: topics?.filter((t) => t.sentiment === 'negative').length || 0,
            },
          }
        }

        setStats(newStats)
      } catch (error) {
        console.error('Erro ao carregar estatísticas:', error)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [selectedClients])

  return (
    <div className="space-y-6">
      {/* Seletores de Clientes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1].map((idx) => (
          <Card key={idx}>
            <CardHeader>
              <CardTitle className="text-sm">
                {idx === 0 ? 'Cliente A' : 'Cliente B'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedClients[idx] || ''}
                onChange={(e) => {
                  const newSelected = [...selectedClients] as [string | null, string | null]
                  newSelected[idx] = e.target.value || null
                  setSelectedClients(newSelected)
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">Selecione um cliente...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Comparação */}
      {selectedClients[0] || selectedClients[1] ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map((idx) => (
            <div key={idx}>
              {!selectedClients[idx] ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-gray-500 text-center">Selecione um cliente para comparar</p>
                  </CardContent>
                </Card>
              ) : stats[idx] ? (
                <div className="space-y-4">
                  {/* Header */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{stats[idx]?.client_name}</CardTitle>
                      <CardDescription>Dados dos últimos 30 dias</CardDescription>
                    </CardHeader>
                  </Card>

                  {/* KPIs */}
                  <Card>
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-700">Total de Matches</span>
                          <span className="text-2xl font-bold text-blue-600">
                            {stats[idx]?.total_matches || 0}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sentimento */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Distribuição de Sentimento</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {stats[idx] && Object.entries(stats[idx].sentiment_distribution).map(([sent, count]) => (
                        <div key={sent}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="capitalize">{sent}</span>
                            <Badge variant="secondary">{count}</Badge>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                sent === 'positive'
                                  ? 'bg-green-500'
                                  : sent === 'negative'
                                    ? 'bg-red-500'
                                    : 'bg-gray-500'
                              }`}
                              style={{
                                width: `${
                                  stats[idx]?.sentiment_distribution &&
                                  stats[idx]!.sentiment_distribution[
                                    sent as keyof SentimentDist
                                  ]
                                    ? (stats[idx]!.sentiment_distribution[
                                        sent as keyof SentimentDist
                                      ] /
                                        Object.values(stats[idx]!.sentiment_distribution).reduce(
                                          (a, b) => a + b,
                                          1
                                        )) *
                                      100
                                    : 0
                                }%`
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-gray-500 text-center">Carregando...</p>
                  </CardContent>
                </Card>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-12 text-center">
            <p className="text-gray-500">Selecione 1 ou 2 clientes para comparar</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
