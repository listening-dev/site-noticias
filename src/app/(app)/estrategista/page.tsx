'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, Sparkles, Globe, Zap, Loader2, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import {
  getTopGlobalThemes,
  getSentimentOverview,
  getGlobalCrises,
  getCampaignRecommendations,
  getStrategistKPIs,
  SentimentOverview,
  GlobalThemeStats,
} from '@/services/strategist-insights'

export default function EstrategistPage() {
  const [kpis, setKpis] = useState<{
    total_unique_themes: number
    global_crises: number
    sentiment_trend: 'improving' | 'worsening' | 'stable'
    media_coverage_trend: 'up' | 'down' | 'stable'
  }>({
    total_unique_themes: 0,
    global_crises: 0,
    sentiment_trend: 'stable',
    media_coverage_trend: 'stable',
  })

  const [topThemes, setTopThemes] = useState<GlobalThemeStats[]>([])
  const [sentimentOverview, setSentimentOverview] = useState<SentimentOverview>({
    positive_percentage: 0,
    neutral_percentage: 0,
    negative_percentage: 0,
    total_news: 0,
  })
  const [globalCrises, setGlobalCrises] = useState<any[]>([])
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      try {
        const [kpisData, themesData, sentimentData, crisesData, recsData] = await Promise.all([
          getStrategistKPIs(supabase),
          getTopGlobalThemes(supabase, 10, 7),
          getSentimentOverview(supabase, 7),
          getGlobalCrises(supabase, 5),
          getCampaignRecommendations(supabase, 5),
        ])

        setKpis(kpisData)
        setTopThemes(themesData)
        setSentimentOverview(sentimentData)
        setGlobalCrises(crisesData)
        setRecommendations(recsData)
      } catch (error) {
        console.error('Erro ao carregar dados:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Insights Globais</h1>
        <p className="text-gray-600 mt-1">
          Tendências, recomendações e análises consolidadas de toda a mídia
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* KPIs Globais */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KPICard
              icon={<Globe className="h-5 w-5" />}
              label="Temas Únicos"
              value={String(kpis.total_unique_themes)}
            />
            <KPICard
              icon={<Zap className="h-5 w-5 text-orange-600" />}
              label="Crises Globais"
              value={String(kpis.global_crises)}
              color="orange"
            />
            <KPICard
              icon={<TrendingUp className="h-5 w-5 text-green-600" />}
              label="Tendência Positiva"
              value={`${sentimentOverview.positive_percentage}%`}
              color="green"
            />
            <KPICard
              icon={<Sparkles className="h-5 w-5 text-purple-600" />}
              label="Recomendações"
              value={String(recommendations.length)}
              color="purple"
            />
          </div>

          {/* Top Temas Globais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top Temas Globais</CardTitle>
              <CardDescription>Temas mais mencionados na mídia (últimos 7 dias)</CardDescription>
            </CardHeader>
            <CardContent>
              {topThemes.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <p className="text-gray-500">Sem temas registrados</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {topThemes.map((theme, idx) => (
                    <div key={theme.theme_id} className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-gray-400 w-8">#{idx + 1}</span>
                          <div>
                            <p className="font-semibold text-gray-900">{theme.theme_name}</p>
                            <p className="text-sm text-gray-600">
                              {theme.mention_count} menção{theme.mention_count !== 1 ? 's' : ''} •{' '}
                              😊 {theme.sentiment_distribution.positive} 😐{' '}
                              {theme.sentiment_distribution.neutral} 😞{' '}
                              {theme.sentiment_distribution.negative}
                            </p>
                          </div>
                        </div>
                      </div>
                      {theme.trending && (
                        <Badge className="bg-red-100 text-red-800">Trending 🔥</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Análise de Sentimento Global */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sentimento Geral</CardTitle>
                <CardDescription>
                  Proporção de notícias ({sentimentOverview.total_news} total)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Positivo */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">😊 Positivo</span>
                      <span className="text-lg font-bold text-green-600">
                        {sentimentOverview.positive_percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${sentimentOverview.positive_percentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Neutro */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">😐 Neutro</span>
                      <span className="text-lg font-bold text-gray-600">
                        {sentimentOverview.neutral_percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gray-500 h-2 rounded-full"
                        style={{ width: `${sentimentOverview.neutral_percentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Negativo */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">😞 Negativo</span>
                      <span className="text-lg font-bold text-red-600">
                        {sentimentOverview.negative_percentage}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full"
                        style={{ width: `${sentimentOverview.negative_percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Crises Globais</CardTitle>
                <CardDescription>Temas em crise na mídia</CardDescription>
              </CardHeader>
              <CardContent>
                {globalCrises.length === 0 ? (
                  <div className="bg-green-50 rounded-lg p-8 text-center">
                    <p className="text-green-700 font-medium">✓ Nenhuma crise global detectada</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {globalCrises.map((crisis, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-lg p-3 ${
                          crisis.severity === 'critical'
                            ? 'bg-red-50 border-red-200'
                            : 'bg-orange-50 border-orange-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Zap
                            className={`h-4 w-4 ${
                              crisis.severity === 'critical'
                                ? 'text-red-600'
                                : 'text-orange-600'
                            }`}
                          />
                          <span className="font-semibold text-sm text-gray-900">
                            {crisis.theme_name}
                          </span>
                          <Badge
                            className={
                              crisis.severity === 'critical'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-orange-100 text-orange-800'
                            }
                          >
                            {crisis.severity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Oportunidades de Campanha */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Oportunidades de Campanha</CardTitle>
              <CardDescription>Temas com alto potencial de engajamento</CardDescription>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <p className="text-gray-500">Sem recomendações no momento</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="border border-blue-200 bg-blue-50 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{rec.theme}</p>
                          <p className="text-sm text-gray-700 mt-1">{rec.reason}</p>
                          <div className="mt-2 text-xs text-gray-600">
                            <span
                              className={`inline-block px-2 py-1 rounded-full ${
                                rec.sentiment === 'positive'
                                  ? 'bg-green-100 text-green-800'
                                  : rec.sentiment === 'negative'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {rec.sentiment === 'positive'
                                ? '😊 Positivo'
                                : rec.sentiment === 'negative'
                                  ? '😞 Negativo'
                                  : '😐 Neutro'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">
                            {rec.opportunity_score.toFixed(0)}
                          </p>
                          <p className="text-xs text-gray-600">Score</p>
                        </div>
                      </div>
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

function KPICard({
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
    orange: 'bg-orange-50 text-orange-700',
    purple: 'bg-purple-50 text-purple-700',
    cyan: 'bg-cyan-50 text-cyan-700',
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
