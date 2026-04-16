'use client'

import { useState, useEffect } from 'react'
import { Search, X, ChevronDown, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'

export interface SearchFiltersState {
  query: string
  dateFrom: string  // ISO 8601 with time: "2026-04-10T14:30:00"
  dateTo: string    // ISO 8601 with time: "2026-04-15T18:45:00"
  sentiment: '' | 'positive' | 'neutral' | 'negative'
  categories: string[]
  topics: string[]
  sortBy: 'recent' | 'trending' | 'relevance'
}

interface SearchFiltersProps {
  onFilterChange: (filters: SearchFiltersState) => void
  isLoading?: boolean
}

const SENTIMENT_OPTIONS = [
  { value: 'positive', label: '😊 Positivo', color: 'bg-green-100 text-green-800' },
  { value: 'neutral', label: '😐 Neutro', color: 'bg-gray-100 text-gray-800' },
  { value: 'negative', label: '😞 Negativo', color: 'bg-red-100 text-red-800' },
]

const SORT_OPTIONS = [
  { value: 'recent', label: 'Mais Recentes' },
  { value: 'trending', label: 'Tendências' },
  { value: 'relevance', label: 'Relevância' },
]

function toLocalDatetimeString(date: Date): string {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

export function SearchFilters({ onFilterChange, isLoading }: SearchFiltersProps) {
  const supabase = createClient()
  const [filters, setFilters] = useState<SearchFiltersState>({
    query: '',
    dateFrom: toLocalDatetimeString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    dateTo: toLocalDatetimeString(new Date()),
    sentiment: '',
    categories: [],
    topics: [],
    sortBy: 'recent',
  })

  const [expanded, setExpanded] = useState(true)
  const [categoryOptions, setCategoryOptions] = useState<string[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)

  // Load available categories from Supabase
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoadingCategories(true)
        const { data: newsData } = await supabase
          .schema('noticias')
          .from('news')
          .select('category')
          .not('category', 'is', null)
          .limit(1000)

        const uniqueCategories = Array.from(
          new Set(newsData?.map((n) => n.category).filter(Boolean) || [])
        ).sort()

        setCategoryOptions(uniqueCategories as string[])
      } catch (error) {
        console.error('Erro ao carregar categorias:', error)
      } finally {
        setLoadingCategories(false)
      }
    }

    loadCategories()
  }, [])

  const handleFilterChange = (newFilters: Partial<SearchFiltersState>) => {
    const updated = { ...filters, ...newFilters }
    setFilters(updated)

    // Converter datas para ISO completo antes de enviar
    const filtersToSend = { ...updated }
    if (updated.dateFrom) {
      // Formato de entrada: YYYY-MM-DDTHH:mm
      // Formato de saída: YYYY-MM-DDTHH:mm:ss.000Z (ISO 8601)
      filtersToSend.dateFrom = normalizeToISO(updated.dateFrom)
    }
    if (updated.dateTo) {
      filtersToSend.dateTo = normalizeToISO(updated.dateTo)
    }

    onFilterChange(filtersToSend)
  }

  function normalizeToISO(datetimeLocal: string): string {
    if (!datetimeLocal.includes('T')) {
      return datetimeLocal
    }
    const date = new Date(`${datetimeLocal}:00`) // Adiciona :00 segundos
    return date.toISOString()
  }

  const toggleCategory = (cat: string) => {
    const updated = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat]
    handleFilterChange({ categories: updated })
  }

  const addTopic = (topic: string) => {
    if (!filters.topics.includes(topic) && topic.trim()) {
      handleFilterChange({ topics: [...filters.topics, topic] })
    }
  }

  const removeTopic = (topic: string) => {
    handleFilterChange({ topics: filters.topics.filter((t) => t !== topic) })
  }

  return (
    <Card className="bg-white">
      <CardContent className="pt-6">
        {/* Search Input */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar em todas as notícias..."
              value={filters.query}
              onChange={(e) => handleFilterChange({ query: e.target.value })}
              className="pl-10"
              disabled={isLoading}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            Suporta operadores: AND, OR, NOT. Ex: "inflação AND economia"
          </p>
        </div>

        {/* Collapsible Filter Sections */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full mb-4 text-sm font-semibold text-gray-700 hover:text-gray-900"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? '' : '-rotate-90'}`}
          />
          Filtros Avançados
          <span className="ml-auto text-xs text-gray-500">
            {filters.categories.length + filters.topics.length > 0
              ? `${filters.categories.length + filters.topics.length} ativo`
              : ''}
          </span>
        </button>

        {expanded && (
          <div className="space-y-6 border-t pt-6">
            {/* Period */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Período (com horário)</label>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange({ dateFrom: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  disabled={isLoading}
                />
                <span className="flex items-center text-gray-500">—</span>
                <input
                  type="datetime-local"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange({ dateTo: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  disabled={isLoading}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Hora local será preservada na busca</p>
            </div>

            {/* Sentiment */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Sentimento</label>
              <div className="flex flex-wrap gap-2">
                {SENTIMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() =>
                      handleFilterChange({
                        sentiment: filters.sentiment === opt.value ? '' : (opt.value as any),
                      })
                    }
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filters.sentiment === opt.value
                        ? opt.color
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    disabled={isLoading}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                Categorias
                {loadingCategories && <span className="text-xs text-gray-500">(carregando...)</span>}
              </label>
              {categoryOptions.length === 0 && !loadingCategories && (
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  Nenhuma categoria encontrada
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                      filters.categories.includes(cat)
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    disabled={isLoading || loadingCategories}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Topics/Themes */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Temas/Tópicos</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Digite um tema e pressione Enter..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addTopic(e.currentTarget.value)
                      e.currentTarget.value = ''
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  disabled={isLoading}
                />
              </div>
              {filters.topics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {filters.topics.map((topic) => (
                    <Badge key={topic} variant="secondary" className="gap-1 pr-1">
                      {topic}
                      <button
                        onClick={() => removeTopic(topic)}
                        className="ml-1 hover:text-red-600"
                        disabled={isLoading}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Sort */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Ordenação</label>
              <select
                value={filters.sortBy}
                onChange={(e) => handleFilterChange({ sortBy: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                disabled={isLoading}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Button */}
            {(filters.categories.length > 0 || filters.topics.length > 0 || filters.sentiment) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleFilterChange({
                    sentiment: '',
                    categories: [],
                    topics: [],
                  })
                }
                disabled={isLoading}
              >
                Limpar Filtros
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
