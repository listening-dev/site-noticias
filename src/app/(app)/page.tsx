import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NewsCard } from '@/components/news/news-card'
import { NewsFilters } from '@/components/news/news-filters'
import { Skeleton } from '@/components/ui/skeleton'
import { Suspense } from 'react'
import { NewsWithSource, Source } from '@/lib/types/database'

interface PageProps {
  searchParams: Promise<{ source?: string; category?: string; page?: string }>
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const pageSize = 30
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Buscar fontes e categorias para os filtros
  const { data: rawSources } = await supabase
    .schema('noticias')
    .from('sources')
    .select('*')
    .eq('active', true)
    .order('name')

  const hiddenSources = ['Correio do Povo', 'Correio do Povo - Política', 'Correio do Povo - Economia', 'UOL Notícias', 'UOL Economia']
  const sources = (rawSources ?? []).filter((s: Source) => !hiddenSources.includes(s.name))

  const categories = [...new Set(sources.map((s: Source) => s.category).filter(Boolean))] as string[]

  // Montar query de notícias
  let query = supabase
    .schema('noticias')
    .from('news')
    .select('*, sources(*)', { count: 'exact' })
    .order('published_at', { ascending: false })
    .range(from, to)

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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Visão Geral</h2>
        <p className="text-sm text-gray-500 mt-1">
          {count ?? 0} notícias disponíveis
        </p>
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
                <Link href={`?page=${page - 1}${params.source ? `&source=${params.source}` : ''}${params.category ? `&category=${params.category}` : ''}`}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200">
                  ← Anterior
                </Link>
              )}
              <span className="px-4 py-2 text-sm text-gray-500">Página {page} de {totalPages}</span>
              {page < totalPages && (
                <Link href={`?page=${page + 1}${params.source ? `&source=${params.source}` : ''}${params.category ? `&category=${params.category}` : ''}`}
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
