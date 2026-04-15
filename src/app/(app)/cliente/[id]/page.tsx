import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewsCard } from '@/components/news/news-card'
import { NewsFilters } from '@/components/news/news-filters'
import { PeriodSelector } from '@/components/report/period-selector'
import { Badge } from '@/components/ui/badge'
import { extractKeywords } from '@/services/boolean-search'
import { Filter, Newspaper } from 'lucide-react'
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

  // Buscar cliente
  const { data: client } = await supabase
    .schema('noticias')
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) notFound()

  // Buscar filtros do cliente
  const { data: filters } = await supabase
    .schema('noticias')
    .from('client_filters')
    .select('*')
    .eq('client_id', id)
    .eq('active', true)

  // Buscar fontes vinculadas ao cliente
  const { data: clientSources } = await supabase
    .schema('noticias')
    .from('client_sources')
    .select('source_id, sources(*)')
    .eq('client_id', id)

  const linkedSources: Source[] = (clientSources ?? []).map((cs: any) => cs.sources).filter(Boolean)
  const linkedSourceIds = linkedSources.map((s) => s.id)
  const hasLinkedSources = linkedSourceIds.length > 0

  // Buscar categorias das fontes vinculadas para filtros
  const linkedCategories = hasLinkedSources
    ? [...new Set(linkedSources.map((s) => s.category).filter(Boolean))] as string[]
    : []

  // Buscar notícias: matches booleanos + notícias das fontes vinculadas
  let newsItems: any[] = []
  let totalCount = 0

  // 1. Matches booleanos (client_news)
  const { data: clientNews } = await supabase
    .schema('noticias')
    .from('client_news')
    .select('news_id, news(*, sources(*))')
    .eq('client_id', id)
    .gte('matched_at', from.toISOString())
    .lte('matched_at', to.toISOString())

  const matchedNews = (clientNews ?? []).map((cn: any) => cn.news).filter(Boolean)

  // 2. Notícias das fontes vinculadas
  let sourceNews: any[] = []
  if (hasLinkedSources) {
    let sourceQuery = supabase
      .schema('noticias')
      .from('news')
      .select('*, sources(*)')
      .in('source_id', linkedSourceIds)
      .gte('published_at', from.toISOString())
      .lte('published_at', to.toISOString())
      .order('published_at', { ascending: false })
      .limit(3000)

    if (sp.source) sourceQuery = sourceQuery.eq('source_id', sp.source)
    if (sp.category) sourceQuery = sourceQuery.eq('category', sp.category)

    const { data } = await sourceQuery
    sourceNews = data ?? []
  }

  // 3. Mesclar e deduplicar por news.id
  const seenIds = new Set<string>()
  const allNews: any[] = []

  // Fontes vinculadas primeiro (mais recentes no topo)
  for (const n of sourceNews) {
    if (!seenIds.has(n.id)) {
      seenIds.add(n.id)
      allNews.push(n)
    }
  }
  // Depois matches booleanos
  for (const n of matchedNews) {
    if (!seenIds.has(n.id)) {
      seenIds.add(n.id)
      allNews.push(n)
    }
  }

  // Ordenar por data de publicação
  allNews.sort((a, b) => {
    const da = new Date(a.published_at || 0).getTime()
    const db = new Date(b.published_at || 0).getTime()
    return db - da
  })

  totalCount = allNews.length

  // Paginar
  newsItems = allNews.slice(rangeFrom, rangeTo + 1)
  const totalPages = Math.ceil(totalCount / pageSize) || 1

  // Extrair keywords de todos os filtros ativos (para highlight)
  const allKeywords = (filters ?? []).flatMap((f: any) => extractKeywords(f.boolean_query))
  const uniqueKeywords = [...new Set(allKeywords)]

  // Buscar favoritos e lidas
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
      {/* Cabeçalho do cliente */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{client.name}</h2>
        {client.description && (
          <p className="text-sm text-gray-500 mt-1">{client.description}</p>
        )}
        <p className="text-sm text-gray-400 mt-1">
          {totalCount} notícias encontradas
        </p>
      </div>

      <div className="mb-6">
        <PeriodSelector from={from.toISOString()} to={to.toISOString()} />
      </div>

      {/* Filtros de portal (quando há fontes vinculadas) */}
      {hasLinkedSources && (
        <NewsFilters sources={linkedSources} categories={linkedCategories} />
      )}

      {/* Filtros booleanos ativos */}
      {filters && filters.length > 0 && (
        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Filter size={14} className="text-blue-600" />
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Filtros de busca ativos</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((filter: any) => (
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

      {/* Lista de notícias */}
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
              />
            ))}
          </div>

          {/* Paginação */}
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
      ) : (
        <div className="text-center py-16 text-gray-400">
          <Newspaper className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhuma notícia encontrada</p>
          <p className="text-sm mt-1">
            {(filters && filters.length > 0) || hasLinkedSources
              ? 'Nenhum resultado no período selecionado. Ajuste o período ou aguarde a próxima coleta.'
              : 'Configure filtros booleanos ou vincule fontes para este cliente na área de administração.'}
          </p>
        </div>
      )}
    </div>
  )
}
