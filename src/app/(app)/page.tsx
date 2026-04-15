import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NewsCard } from '@/components/news/news-card'
import { NewsFilters } from '@/components/news/news-filters'
import { PeriodSelector } from '@/components/report/period-selector'
import { Skeleton } from '@/components/ui/skeleton'
import { Suspense } from 'react'
import { NewsWithSource, Source } from '@/lib/types/database'

interface PageProps {
  searchParams: Promise<{ source?: string; category?: string; page?: string; from?: string; to?: string }>
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = 30
  const rangeFrom = (page - 1) * pageSize
  const rangeTo = rangeFrom + pageSize - 1

  const now = new Date()
  const to = params.to ? new Date(params.to) : now
  const from = params.from ? new Date(params.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Buscar fontes visíveis na visão geral
  const { data: sources } = await supabase
    .schema('noticias')
    .from('sources')
    .select('*')
    .eq('active', true)
    .eq('visible_in_overview', true)
    .order('name')

  const categories = [...new Set((sources ?? []).map((s: Source) => s.category).filter(Boolean))] as string[]
  const visibleSourceIds = (sources ?? []).map((s: Source) => s.id)

  // Montar query de notícias apenas de fontes visíveis
  let query = supabase
    .schema('noticias')
    .from('news')
    .select('*, sources(*)', { count: 'exact' })
    .in('source_id', visibleSourceIds)
    .gte('published_at', from.toISOString())
    .lte('published_at', to.toISOString())
    .order('published_at', { ascending: false })
    .range(rangeFrom, rangeTo)

  if (params.source) query = query.eq('source_id', params.source)
  if (params.category) query = query.eq('category', params.category)

  const { data: news, count } = await query

  // Buscar favoritos e lidas do usuário
  const newsIds = (news ?? []).map((n: any) => n.id)
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

  const totalPages = count ? Math.ceil(count / pageSize) : 1

  function buildPageUrl(p: number) {
    const qp = new URLSearchParams()
    qp.set('from', from.toISOString())
    qp.set('to', to.toISOString())
    if (params.source) qp.set('source', params.source)
    if (params.category) qp.set('category', params.category)
    if (p > 1) qp.set('page', String(p))
    return `?${qp.toString()}`
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Visão Geral</h2>
        <p className="text-sm text-gray-500 mt-1">
          {count ?? 0} notícias disponíveis
        </p>
      </div>

      <div className="mb-6">
        <PeriodSelector from={from.toISOString()} to={to.toISOString()} />
      </div>

      <Suspense fallback={<FiltersSkeleton />}>
        <NewsFilters sources={sources ?? []} categories={categories} />
      </Suspense>

      {news && news.length > 0 ? (
        <>
          <div className="grid gap-3">
            {news.map((item: any) => (
              <NewsCard
                key={item.id}
                news={item}
                isFavorited={favoritedIds.has(item.id)}
                isRead={readIds.has(item.id)}
              />
            ))}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {page > 1 && (
                <Link href={buildPageUrl(page - 1)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200">
                  ← Anterior
                </Link>
              )}
              <span className="px-4 py-2 text-sm text-gray-500">Página {page} de {totalPages}</span>
              {page < totalPages && (
                <Link href={buildPageUrl(page + 1)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200">
                  Próxima →
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">Nenhuma notícia encontrada</p>
          <p className="text-sm mt-1">Tente ajustar os filtros ou aguarde a próxima atualização dos feeds.</p>
        </div>
      )}
    </div>
  )
}

function FiltersSkeleton() {
  return (
    <div className="flex gap-2 mb-6">
      {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-7 w-20" />)}
    </div>
  )
}
