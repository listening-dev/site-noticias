'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PeriodSelector } from './period-selector'
import { SourcesChart } from './charts/sources-chart'
import { CategoriesChart } from './charts/categories-chart'
import { TimelineChart } from './charts/timeline-chart'
import { Sparkles, Loader2, Newspaper, Globe, Tag } from 'lucide-react'
import { Client } from '@/lib/types/database'

interface ReportContentProps {
  from: string
  to: string
  totalNews: number
  sourceStats: { name: string; count: number }[]
  categoryStats: { name: string; count: number }[]
  timelineStats: { date: string; count: number }[]
  topTitles: { title: string; source: string }[]
  clients: Client[]
  selectedClientId: string | null
  selectedClientName: string | null
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            {icon}
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{value.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ReportContent({
  from,
  to,
  totalNews,
  sourceStats,
  categoryStats,
  timelineStats,
  topTitles,
  clients,
  selectedClientId,
  selectedClientName,
}: ReportContentProps) {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generateAnalysis() {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/report/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          totalNews,
          sourceStats: sourceStats.slice(0, 15),
          categoryStats: categoryStats.slice(0, 10),
          topTitles: topTitles.slice(0, 20),
          clientName: selectedClientName,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao gerar análise')
      }
      const data = await res.json()
      setAnalysis(data.analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar análise')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <>
      <PeriodSelector
        from={from}
        to={to}
        clients={clients}
        selectedClientId={selectedClientId}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        <StatCard icon={<Newspaper size={20} />} label="Total de notícias" value={totalNews} />
        <StatCard icon={<Globe size={20} />} label="Portais ativos" value={sourceStats.length} />
        <StatCard icon={<Tag size={20} />} label="Categorias" value={categoryStats.length} />
      </div>

      {/* AI Analysis */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" />
              Análise com Inteligência Artificial
            </CardTitle>
            <Button
              onClick={generateAnalysis}
              disabled={isGenerating || totalNews === 0}
              size="sm"
              className="gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Gerar Análise
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        {(analysis || isGenerating || error) && (
          <CardContent>
            {isGenerating ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            ) : error ? (
              <div className="rounded-lg bg-red-50 border border-red-100 p-4">
                <p className="text-sm text-red-700">{error}</p>
                <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={generateAnalysis}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {analysis}
              </div>
            )}
          </CardContent>
        )}
        {!analysis && !isGenerating && !error && (
          <CardContent>
            <p className="text-sm text-gray-400">
              Clique em &quot;Gerar Análise&quot; para obter uma análise detalhada do período selecionado.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SourcesChart data={sourceStats} />
        <CategoriesChart data={categoryStats} />
      </div>

      <div className="mb-6">
        <TimelineChart data={timelineStats} />
      </div>
    </>
  )
}
