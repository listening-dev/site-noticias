'use client'

import { useTransition, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Search, X } from 'lucide-react'
import { Source } from '@/lib/types/database'
import { Button } from '@/components/ui/button'

interface NewsFiltersProps {
  sources: Source[]
  categories: string[]
  keywordChips?: string[]
  activeKeyword?: string
  activeQ?: string
}

export function NewsFilters({ sources, categories, keywordChips = [], activeKeyword = '', activeQ = '' }: NewsFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const searchRef = useRef<HTMLInputElement>(null)

  const activeSource = searchParams.get('source') || ''
  const activeCategory = searchParams.get('category') || ''

  function setFilter(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }
    params.delete('page')
    startTransition(() => {
      router.push(`?${params.toString()}`)
    })
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = searchRef.current?.value.trim() ?? ''
    setFilter({ q })
  }

  function clearSearch() {
    if (searchRef.current) searchRef.current.value = ''
    setFilter({ q: '' })
  }

  return (
    <div className={`space-y-4 mb-6 transition-all duration-200 ${isPending ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Busca dentro da aba */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            defaultValue={activeQ}
            placeholder="Buscar nesta aba..."
            className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {activeQ && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="outline" size="sm">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
        </Button>
      </form>

      <div className="flex flex-wrap gap-4">
        {/* Filtro por fonte/portal */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Portal</p>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip label="Todos" active={!activeSource} isPending={isPending} onClick={() => setFilter({ source: '' })} />
            {sources.map((s) => (
              <FilterChip
                key={s.id}
                label={s.name}
                active={activeSource === s.id}
                isPending={isPending}
                onClick={() => setFilter({ source: activeSource === s.id ? '' : s.id })}
              />
            ))}
          </div>
        </div>

        {/* Filtro por categoria */}
        {categories.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoria</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="Todas" active={!activeCategory} isPending={isPending} onClick={() => setFilter({ category: '' })} />
              {categories.map((cat) => (
                <FilterChip
                  key={cat}
                  label={cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}
                  active={activeCategory === cat}
                  isPending={isPending}
                  onClick={() => setFilter({ category: activeCategory === cat ? '' : cat })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filtro por palavra-chave do cliente */}
        {keywordChips.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Palavra-chave</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="Todas" active={!activeKeyword} isPending={isPending} onClick={() => setFilter({ keyword: '' })} />
              {keywordChips.map((kw) => (
                <FilterChip
                  key={kw}
                  label={kw}
                  active={activeKeyword === kw}
                  isPending={isPending}
                  onClick={() => setFilter({ keyword: activeKeyword === kw ? '' : kw })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({ label, active, isPending, onClick }: { label: string; active: boolean; isPending: boolean; onClick: () => void }) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
      className="h-7 text-xs transition-all duration-200 gap-1.5"
    >
      {label}
      {active && isPending && <Loader2 className="h-3 w-3 animate-spin" />}
    </Button>
  )
}
