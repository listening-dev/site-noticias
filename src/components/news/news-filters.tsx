'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Source } from '@/lib/types/database'
import { Button } from '@/components/ui/button'

interface NewsFiltersProps {
  sources: Source[]
  categories: string[]
}

export function NewsFilters({ sources, categories }: NewsFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const activeSource = searchParams.get('source') || ''
  const activeCategory = searchParams.get('category') || ''

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page') // Resetar paginação ao filtrar
    startTransition(() => {
      router.push(`?${params.toString()}`)
    })
  }

  return (
    <div className={`flex flex-wrap gap-4 mb-6 transition-all duration-200 ${isPending ? 'opacity-60 pointer-events-none' : ''}`}>
      {/* Filtro por fonte/portal */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Portal</p>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="Todos" active={!activeSource} isPending={isPending} onClick={() => setFilter('source', '')} />
          {sources.map((s) => (
            <FilterChip
              key={s.id}
              label={s.name}
              active={activeSource === s.id}
              isPending={isPending}
              onClick={() => setFilter('source', activeSource === s.id ? '' : s.id)}
            />
          ))}
        </div>
      </div>

      {/* Filtro por categoria */}
      {categories.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categoria</p>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip label="Todas" active={!activeCategory} isPending={isPending} onClick={() => setFilter('category', '')} />
            {categories.map((cat) => (
              <FilterChip
                key={cat}
                label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                active={activeCategory === cat}
                isPending={isPending}
                onClick={() => setFilter('category', activeCategory === cat ? '' : cat)}
              />
            ))}
          </div>
        </div>
      )}
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
