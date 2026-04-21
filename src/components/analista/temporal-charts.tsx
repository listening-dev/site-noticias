'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CategoryVolume, DailyStats, TopThemeInPeriod } from '@/services/temporal-analysis'

interface TemporalChartsProps {
  dailyStats?: DailyStats[]
  categoryVolume?: CategoryVolume[]
  topThemes?: TopThemeInPeriod[]
  loading?: boolean
}

export function TemporalCharts({
  dailyStats = [],
  categoryVolume = [],
  topThemes = [],
  loading = false,
}: TemporalChartsProps) {
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

  const formattedCategory = useMemo(
    () =>
      categoryVolume.map((c) => ({
        ...c,
        category: capitalize(c.category),
      })),
    [categoryVolume]
  )

  return (
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Volume por Categoria</CardTitle>
          <CardDescription>Distribuição das notícias entre categorias no período</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || formattedCategory.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center h-80 flex items-center justify-center">
              <p className="text-gray-500">
                {loading ? 'Carregando gráfico...' : 'Sem dados de categoria para o período'}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={formattedCategory}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#6b7280" style={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="category"
                  stroke="#6b7280"
                  style={{ fontSize: 12 }}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                  formatter={(value) => [value, 'Notícias']}
                />
                <Bar dataKey="count" fill="#3b82f6" name="Notícias" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top Temas do Período</CardTitle>
          <CardDescription>Tópicos mais mencionados nas notícias do período</CardDescription>
        </CardHeader>
        <CardContent>
          {loading || topThemes.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <p className="text-gray-500">
                {loading ? 'Carregando...' : 'Sem temas extraídos no período'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {topThemes.map((t, idx) => (
                <div key={t.topic_name} className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-400 w-6 text-right">#{idx + 1}</span>
                  <span className="flex-1 text-sm text-gray-900 truncate">{t.topic_name}</span>
                  <span className="text-sm font-semibold text-blue-600">
                    {t.mention_count} {t.mention_count === 1 ? 'menção' : 'menções'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {(() => {
        const totalNews = formattedDailyStats.reduce((sum, d) => sum + d.total_news, 0)
        const mediaDia = formattedDailyStats.length > 0
          ? Math.round(totalNews / formattedDailyStats.length)
          : 0
        const dominantCategory = formattedCategory[0]?.category ?? '—'
        const topTheme = topThemes[0]?.topic_name ?? '—'

        return (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatBox label="Total de Notícias" value={String(totalNews)} color="bg-blue-50 text-blue-700" />
            <StatBox label="Média por Dia" value={String(mediaDia)} color="bg-purple-50 text-purple-700" />
            <StatBox label="Categoria Dominante" value={dominantCategory} color="bg-emerald-50 text-emerald-700" />
            <StatBox label="Tema Mais Citado" value={topTheme} color="bg-amber-50 text-amber-700" />
          </div>
        )
      })()}
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`rounded-lg p-4 ${color}`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-2xl font-bold mt-1 truncate" title={value}>{value}</p>
    </div>
  )
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
