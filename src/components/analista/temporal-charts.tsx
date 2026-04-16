'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DailyStats, SentimentTrend } from '@/services/temporal-analysis'

interface TemporalChartsProps {
  dailyStats?: DailyStats[]
  sentimentTrend?: SentimentTrend[]
  loading?: boolean
}

export function TemporalCharts({ dailyStats = [], sentimentTrend = [], loading = false }: TemporalChartsProps) {
  // Formatar datas para exibição
  const formattedDailyStats = useMemo(
    () =>
      dailyStats.map((d) => ({
        ...d,
        date: new Date(d.date).toLocaleDateString('pt-BR', {
          month: 'short',
          day: 'numeric',
        }),
      })),
    [dailyStats]
  )

  const formattedSentiment = useMemo(
    () =>
      sentimentTrend.map((s) => ({
        ...s,
        date: new Date(s.date).toLocaleDateString('pt-BR', {
          month: 'short',
          day: 'numeric',
        }),
      })),
    [sentimentTrend]
  )

  return (
    <div className="space-y-6">
      {/* Volume de Notícias */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Volume de Notícias</CardTitle>
          <CardDescription>Quantidade de notícias por dia no período selecionado</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || formattedDailyStats.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center h-80 flex items-center justify-center">
              <p className="text-gray-500">
                {loading ? 'Carregando gráfico...' : 'Sem dados para o período selecionado'}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={formattedDailyStats} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: 12 }} />
                <YAxis stroke="#6b7280" style={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                  formatter={(value) => [value, 'Notícias']}
                />
                <Area
                  type="monotone"
                  dataKey="total_news"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#colorVolume)"
                  name="Total de Notícias"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Sentimento ao Longo do Tempo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tendência de Sentimento</CardTitle>
          <CardDescription>Evolução de sentimentos (positivo, neutro, negativo) ao longo do tempo</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || formattedSentiment.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center h-80 flex items-center justify-center">
              <p className="text-gray-500">
                {loading ? 'Carregando gráfico...' : 'Sem dados de sentimento para o período'}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={formattedSentiment} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: 12 }} />
                <YAxis stroke="#6b7280" style={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="positive"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Positivo"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="neutral"
                  stroke="#6b7280"
                  strokeWidth={2}
                  name="Neutro"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="negative"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="Negativo"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Distribuição de Sentimento por Dia */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Distribuição por Dia</CardTitle>
          <CardDescription>Quantidade de notícias por sentimento em cada dia</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || formattedDailyStats.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center h-80 flex items-center justify-center">
              <p className="text-gray-500">
                {loading ? 'Carregando gráfico...' : 'Sem dados para o período selecionado'}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={formattedDailyStats} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: 12 }} />
                <YAxis stroke="#6b7280" style={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="positive_sentiment" stackId="sentiment" fill="#10b981" name="Positivo" />
                <Bar dataKey="neutral_sentiment" stackId="sentiment" fill="#6b7280" name="Neutro" />
                <Bar dataKey="negative_sentiment" stackId="sentiment" fill="#ef4444" name="Negativo" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Estatísticas Resumidas */}
      {(() => {
        const totalNews = formattedDailyStats.reduce((sum, d) => sum + d.total_news, 0)
        const pos = formattedDailyStats.reduce((sum, d) => sum + d.positive_sentiment, 0)
        const neu = formattedDailyStats.reduce((sum, d) => sum + (d.neutral_sentiment ?? 0), 0)
        const neg = formattedDailyStats.reduce((sum, d) => sum + d.negative_sentiment, 0)
        const analisadas = pos + neu + neg
        const mediaDia = formattedDailyStats.length > 0
          ? Math.round(totalNews / formattedDailyStats.length)
          : 0
        const coberturaPct = totalNews > 0 ? Math.round((analisadas / totalNews) * 100) : 0

        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatBox label="Total de Notícias" value={totalNews} color="bg-blue-50 text-blue-700" />
              <StatBox label="Média por Dia" value={mediaDia} color="bg-purple-50 text-purple-700" />
              <StatBox
                label="Positivo"
                value={pos}
                subtitle={analisadas > 0 ? `de ${analisadas} analisadas` : 'sem análise ainda'}
                color="bg-green-50 text-green-700"
              />
              <StatBox
                label="Negativo"
                value={neg}
                subtitle={analisadas > 0 ? `de ${analisadas} analisadas` : 'sem análise ainda'}
                color="bg-red-50 text-red-700"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Cobertura de análise de sentimento: <span className="font-semibold">{analisadas}/{totalNews} notícias ({coberturaPct}%)</span>.
              {coberturaPct < 80 && ' A análise é aplicada gradualmente pelo pipeline de NLP — notícias antigas sem análise não entram nos totais de sentimento.'}
            </p>
          </>
        )
      })()}
    </div>
  )
}

function StatBox({ label, value, subtitle, color }: { label: string; value: number; subtitle?: string; color: string }) {
  return (
    <div className={`rounded-lg p-4 ${color}`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {subtitle && <p className="text-xs opacity-60 mt-1">{subtitle}</p>}
    </div>
  )
}
