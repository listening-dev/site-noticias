import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewsCard } from '@/components/news/news-card'
import { Badge } from '@/components/ui/badge'
import { extractKeywords } from '@/services/boolean-search'
import { Filter, Newspaper } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function ClientePage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { page: pageParam } = await searchParams
  const page = Number(pageParam) || 1
  const pageSize = 30
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

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

  // Buscar notícias matched para este cliente
  const { data: clientNews, count } = await supabase
    .schema('noticias')
    .from('client_news')
    .select('*, news(*, sources(*))', { count: 'exact' })
    .eq('client_id', id)
    .order('matched_at', { ascending: false })
    .range(from, to)

  const newsItems = (clientNews ?? []).map((cn: any) => cn.news).filter(Boolean)

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
  const totalPages = count ? Math.ceil(count / pageSize) : 1

  return (
    <div>
      {/* Cabeçalho do cliente */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{client.name}</h2>
        {client.description && (
          <p className="text-sm text-gray-500 mt-1">{client.description}</p>
        )}
        <p className="text-sm text-gray-400 mt-1">
          {count ?? 0} notícias encontradas
        </p>
      </div>

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
                <a href={`?page=${page - 1}`} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  ← Anterior
                </a>
              )}
              <span className="px-4 py-2 text-sm text-gray-500">Página {page} de {totalPages}</span>
              {page < totalPages && (
                <a href={`?page=${page + 1}`} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
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
            {filters && filters.length > 0
              ? 'Os filtros deste cliente ainda não retornaram resultados. Aguarde a próxima coleta de feeds.'
              : 'Configure filtros booleanos para este cliente na área de administração.'}
          </p>
        </div>
      )}
    </div>
  )
}
