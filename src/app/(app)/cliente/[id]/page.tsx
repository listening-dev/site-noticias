import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewsCard } from '@/components/news/news-card'
import { NewsFilters } from '@/components/news/news-filters'
import { PeriodSelector } from '@/components/report/period-selector'
import { Badge } from '@/components/ui/badge'
import { extractKeywords } from '@/services/boolean-search'
import { AlertTriangle, Filter, Newspaper } from 'lucide-react'
import { Source } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; from?: string; to?: string; source?: string; category?: string }>
}

export default async function ClientePage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = await searchParams
  const page = Number(sp.page) || 1
  const pageSize = 30
  const rangeFrom = (page - 1) * pageSize
  const rangeTo = rangeFrom + pageSize - 1

  const now = new Date()
  const to = sp.to ? new Date(sp.to) : now
  const from = sp.from ? new Date(sp.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: client } = await supabase
    .schema('noticias')
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  const [{ data: filters }, { data: clientSources }] = await Promise.all([
    supabase
      .schema('noticias')
      .from('client_filters')
      .select('*')
      .eq('client_id', id)
      .eq('active', true),
    supabase
      .schema('noticias')
      .from('client_sources')
      .select('source_id, sources(*)')
      .eq('client_id', id),
  ])

  const linkedSources: Source[] = (clientSources ?? []).map((cs: any) => cs.sources).filter(Boolean)
  const hasLinkedSources = linkedSources.length > 0
  const hasActiveFilters = !!filters && filters.length > 0

  const linkedCategories = hasLinkedSources
    ? ([...new Set(linkedSources.map((s) => s.category).filter(Boolean))] as string[])
    : []

  // Fonte única de verdade: client_news.
  // Matcher já aplica (boolean AND linked_sources quando houver).
  // Cliente sem filtros ativos → sem notícias (modo estrito).
  let newsItems: any[] = []
  let totalCount = 0

  if (hasActiveFilters) {
    let query = supabase
      .schema('noticias')
      .from('client_news')
      .select('news_id, filter_id, news!inner(*, sources(*))', { count: 'exact' })
      .eq('client_id', id)
      .gte('news.published_at', from.toISOString())
      .lte('news.published_at', to.toISOString())
      .order('published_at', { foreignTable: 'news', ascending: false })

    if (sp.source) query = query.eq('news.source_id', sp.source)
    if (sp.category) query = query.eq('news.category', sp.category)

    const { data, count } = await query.range(rangeFrom, rangeTo)

    newsItems = (data ?? []).map((row: any) => ({ ...row.news, _filter_id: row.filter_id }))
    totalCount = count ?? 0
  }

  const totalPages = Math.ceil(totalCount / pageSize) || 1

  const allKeywords = (filters ?? []).flatMap((f: any) => extractKeywords(f.boolean_query))
  const uniqueKeywords = [...new Set(allKeywords)]

  const filtersById = new Map<string, { label: string | null; boolean_query: string }>()
  for (const f of filters ?? []) {
    filtersById.set(f.id, { label: f.label, boolean_query: f.boolean_query })
  }

  const newsIds = newsItems.map((n: any) => n.id)
  const [{ data: favorites }, { data: readNews }] = await Promise.all([
    user && newsIds.length
      ? supabase.schema('noticias').from('user_favorites').select('news_id').eq('user_id', user.id).in('news_id', newsIds)
      : { data: [] },
    user && newsIds.length
      ? supabase.schema('noticias').from('user_read_news').select('news_id').eq('user_id', user.id).in('news_id', newsIds)
      : { data: [] },
  ])

  const favoritedIds = new Set((favorites ?? []).map((f: any) => f.news_id))
  const readIds = new Set((readNews ?? []).map((r: any) => r.news_id))

  function buildPageUrl(p: number) {
    const qp = new URLSearchParams()
    qp.set('from', from.toISOString())
    qp.set('to', to.toISOString())
    if (sp.source) qp.set('source', sp.source)
    if (sp.category) qp.set('category', sp.category)
    if (p > 1) qp.set('page', String(p))
    return `?${qp.toString()}`
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{client.name}</h2>
        {client.description && (
          <p className="text-sm text-gray-500 mt-1">{client.description}</p>
        )}
        <p className="text-sm text-gray-400 mt-1">
          {totalCount} notícias encontradas
        </p>
      </div>

      {!hasActiveFilters && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">Este cliente não tem filtros booleanos ativos.</p>
            <p className="text-amber-700 mt-1">
              Nenhuma notícia será exibida até que ao menos um filtro seja configurado.{' '}
              <a href={`/admin/clientes/${id}`} className="underline font-medium">Configurar filtros →</a>
            </p>
          </div>
        </div>
      )}

      <div className="mb-6">
        <PeriodSelector from={from.toISOString()} to={to.toISOString()} />
      </div>

      {hasLinkedSources && (
        <NewsFilters sources={linkedSources} categories={linkedCategories} />
      )}

      {hasActiveFilters && (
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Filter size={14} className="text-blue-600" />
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Filtros de busca ativos</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters!.map((filter: any) => (
              <div key={filter.id} className="flex flex-col gap-0.5">
                {filter.label && <span className="text-xs text-blue-600 font-medium">{filter.label}</span>}
                <Badge variant="outline" className="text-xs font-mono border-blue-200 text-blue-800 bg-white">
                  {filter.boolean_query}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {newsItems.length > 0 ? (
        <>
          <div className="grid gap-3">
            {newsItems.map((item: any) => (
              <NewsCard
                key={item.id}
                news={item}
                isFavorited={favoritedIds.has(item.id)}
                isRead={readIds.has(item.id)}
                keywords={uniqueKeywords}
                matchedFilter={item._filter_id ? filtersById.get(item._filter_id) ?? null : null}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {page > 1 && (
                <a href={buildPageUrl(page - 1)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  ← Anterior
                </a>
              )}
              <span className="px-4 py-2 text-sm text-gray-500">Página {page} de {totalPages}</span>
              {page < totalPages && (
                <a href={buildPageUrl(page + 1)} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  Próxima →
                </a>
              )}
            </div>
          )}
        </>
      ) : hasActiveFilters ? (
        <div className="text-center py-16 text-gray-400">
          <Newspaper className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhuma notícia encontrada</p>
          <p className="text-sm mt-1">
            Nenhum resultado no período selecionado. Ajuste o período ou aguarde a próxima coleta.
          </p>
        </div>
      ) : null}
    </div>
  )
}
