'use client'

import { useState, useEffect } from 'react'
import { Search, TrendingUp, Filter, Download, Loader2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SearchFilters, SearchFiltersState } from '@/components/analista/search-filters'
import { TemporalCharts } from '@/components/analista/temporal-charts'
import { ExportMenu } from '@/components/analista/export-menu'
import { ComparisonView } from '@/components/analista/comparison-view'
import { createClient } from '@/lib/supabase/client'
import { advancedSearch } from '@/services/advanced-search'
import { SearchResult } from '@/services/advanced-search'
import { getTemporalDistribution, getSentimentTrend } from '@/services/temporal-analysis'

export default function AnalistaPage() {
  const [activeTab, setActiveTab] = useState<'search' | 'analysis' | 'comparison'>('search')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard de Análise</h1>
        <p className="text-gray-600 mt-1">
          Busca avançada, análises temporais e comparações competitivas
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <TabButton
          active={activeTab === 'search'}
          onClick={() => setActiveTab('search')}
          icon={<Search className="h-4 w-4" />}
          label="Busca Avançada"
        />
        <TabButton
          active={activeTab === 'analysis'}
          onClick={() => setActiveTab('analysis')}
          icon={<TrendingUp className="h-4 w-4" />}
          label="Análise Temporal"
        />
        <TabButton
          active={activeTab === 'comparison'}
          onClick={() => setActiveTab('comparison')}
          icon={<Filter className="h-4 w-4" />}
          label="Comparação"
        />
      </div>

      {/* Content */}
      {activeTab === 'search' && <SearchTab />}
      {activeTab === 'analysis' && <AnalysisTab />}
      {activeTab === 'comparison' && <ComparisonTab />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-600 hover:text-gray-900'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function SearchTab() {
  const [filters, setFilters] = useState<SearchFiltersState | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [filteredCount, setFilteredCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userClients, setUserClients] = useState<Array<{ id: string; name: string }>>([])
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const supabase = createClient()

  // Load user's clients
  useEffect(() => {
    const loadClients = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) return

        // Check if user is admin
        const { data: profile } = await supabase
          .schema('noticias')
          .from('user_profiles')
          .select('role')
          .eq('id', userData.user.id)
          .single()

        if (profile?.role === 'admin') {
          // Admin sees all clients
          const { data: allClients } = await supabase
            .schema('noticias')
            .from('clients')
            .select('id, name')
            .order('name')
          setUserClients(allClients ?? [])
        } else {
          // Non-admin sees only their assigned clients
          const { data: userClientLinks } = await supabase
            .schema('noticias')
            .from('user_clients')
            .select('client_id, clients(id, name)')
            .eq('user_id', userData.user.id)

          const clientsList = (userClientLinks ?? [])
            .map((uc: any) => uc.clients)
            .filter(Boolean)
            .sort((a: any, b: any) => a.name.localeCompare(b.name))

          setUserClients(clientsList)

          // Auto-select first client if there's only one
          if (clientsList.length === 1 && clientsList[0]?.id) {
            setSelectedClientIds([clientsList[0].id])
          }
        }
      } catch (error) {
        console.error('Erro ao carregar clientes:', error)
      }
    }

    loadClients()
  }, [])

  useEffect(() => {
    if (!filters) return

    const performSearch = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) {
          setError('Usuário não autenticado')
          return
        }

        const { data, filteredCount: count, error: searchError } = await advancedSearch(
          supabase,
          {
            query: filters.query || undefined,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            sentiment: filters.sentiment || undefined,
            categories: filters.categories.length > 0 ? filters.categories : undefined,
            topicNames: filters.topics.length > 0 ? filters.topics : undefined,
            sortBy: filters.sortBy,
            clientIds: selectedClientIds.length > 0 ? selectedClientIds : undefined,
            pageSize: 20,
          },
          userData.user.id
        )

        if (searchError) {
          setError(searchError)
          setResults([])
          setFilteredCount(0)
          return
        }

        setResults(data)
        setFilteredCount(count)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar')
        setResults([])
      } finally {
        setLoading(false)
      }
    }

    performSearch()
  }, [filters, selectedClientIds])

  return (
    <div className="space-y-6">
      {/* Client Selector */}
      {userClients.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Clientes
              </label>
              <div className="flex flex-wrap gap-2">
                {userClients.map((client) => (
                  <Button
                    key={client.id}
                    variant={selectedClientIds.includes(client.id) ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setSelectedClientIds((prev) =>
                        prev.includes(client.id)
                          ? prev.filter((id) => id !== client.id)
                          : [...prev, client.id]
                      )
                    }}
                    disabled={loading}
                  >
                    {client.name}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <SearchFilters onFilterChange={setFilters} isLoading={loading} />

      {/* Resultados */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-lg">
              Resultados {filteredCount > 0 && `(${filteredCount})`}
            </CardTitle>
            <CardDescription>
              {!filters ? 'Configure os filtros para buscar' : 'Notícias encontradas com os critérios selecionados'}
            </CardDescription>
          </div>
          <ExportMenu results={results} disabled={loading} />
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-900">Erro na busca</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Buscando...</span>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="bg-gray-50 rounded-lg p-12 text-center">
              <Search className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-700 font-medium">
                {filters ? 'Nenhuma notícia encontrada' : 'Configure os filtros para começar'}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {filters ? 'Tente ajustar seus critérios de busca' : 'Selecione o período, categoria ou tema'}
              </p>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <div className="space-y-3">
              {results.map((news) => (
                <SearchResultCard key={news.id} news={news} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SearchResultCard({ news }: { news: SearchResult }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex gap-4">
        {/* Conteúdo */}
        <div className="flex-1">
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-semibold text-blue-600 hover:text-blue-800"
          >
            {news.title}
          </a>

          {news.description && (
            <p className="text-gray-600 text-sm mt-1 line-clamp-2">{news.description}</p>
          )}

          {/* Metadados */}
          <div className="flex gap-4 mt-3 flex-wrap text-xs text-gray-500">
            {news.sources && (
              <span className="font-medium text-gray-700">{news.sources.name}</span>
            )}
            {news.published_at && (
              <span>
                {new Date(news.published_at).toLocaleDateString('pt-BR', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            {news.category && (
              <span className="bg-gray-100 px-2 py-1 rounded capitalize">{news.category}</span>
            )}
          </div>

          {/* Tópicos Extraídos */}
          {news.news_topics?.topics && news.news_topics.topics.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {news.news_topics.topics.slice(0, 5).map((topic, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-medium"
                  title={`Confiança: ${(topic.confidence * 100).toFixed(0)}%`}
                >
                  {topic.name}
                  <span className="text-blue-500 text-xs">({(topic.confidence * 100).toFixed(0)}%)</span>
                </span>
              ))}
            </div>
          )}

          {/* Sentimento */}
          {news.news_topics?.sentiment && (
            <div className="mt-2">
              <span
                className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                  news.news_topics.sentiment === 'positive'
                    ? 'bg-green-100 text-green-800'
                    : news.news_topics.sentiment === 'negative'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                }`}
              >
                {news.news_topics.sentiment === 'positive'
                  ? '😊 Positivo'
                  : news.news_topics.sentiment === 'negative'
                    ? '😞 Negativo'
                    : '😐 Neutro'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function toLocalDatetimeForInput(date: Date): string {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

function AnalysisTab() {
  const [dateFrom, setDateFrom] = useState(
    toLocalDatetimeForInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  )
  const [dateTo, setDateTo] = useState(toLocalDatetimeForInput(new Date()))
  const [loading, setLoading] = useState(false)
  const [dailyStats, setDailyStats] = useState<any[]>([])
  const [sentimentTrend, setSentimentTrend] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        // Converter datetime-local para ISO 8601
        const fromISO = new Date(`${dateFrom}:00`).toISOString()
        const toISO = new Date(`${dateTo}:00`).toISOString()

        const [dailyData, sentimentData] = await Promise.all([
          getTemporalDistribution(supabase, fromISO, toISO),
          getSentimentTrend(supabase, fromISO, toISO),
        ])
        setDailyStats(dailyData)
        setSentimentTrend(sentimentData)
      } catch (error) {
        console.error('Erro ao carregar análise temporal:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [dateFrom, dateTo])

  return (
    <div className="space-y-6">
      {/* Seletor de período */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-2">Data Inicial (com horário)</label>
              <input
                type="datetime-local"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                disabled={loading}
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 block mb-2">Data Final (com horário)</label>
              <input
                type="datetime-local"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                disabled={loading}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Horário local será usado na análise temporal</p>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <TemporalCharts
        dailyStats={dailyStats}
        sentimentTrend={sentimentTrend}
        loading={loading}
      />
    </div>
  )
}

function ComparisonTab() {
  const supabase = createClient()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Análise Comparativa</h3>
        <p className="text-gray-600 text-sm mt-1">
          Compare performance entre seus clientes
        </p>
      </div>

      <ComparisonView supabase={supabase} />
    </div>
  )
}
