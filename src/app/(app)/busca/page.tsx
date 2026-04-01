import { createClient } from '@/lib/supabase/server'
import { NewsCard } from '@/components/news/news-card'
import { extractKeywords } from '@/services/boolean-search'
import { Search } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>
}

export default async function BuscaPage({ searchParams }: PageProps) {
  const { q, page: pageParam } = await searchParams
  const page = Number(pageParam) || 1
  const pageSize = 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let news: any[] = []
  let count = 0

  if (q && q.trim()) {
    // Full-text search em português
    const { data, count: total } = await supabase
      .schema('noticias')
      .from('news')
      .select('*, sources(*)', { count: 'exact' })
      .textSearch('search_vector', q.trim(), { type: 'websearch' })
      .order('published_at', { ascending: false })
      .range(from, to)

    news = data ?? []
    count = total ?? 0
  }

  // Buscar favoritos e lidas
  const newsIds = news.map((n: any) => n.id)
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

  const keywords = q ? extractKeywords(q) : []

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Busca Global</h2>
        {q && (
          <p className="text-sm text-gray-500 mt-1">
            {count} resultado{count !== 1 ? 's' : ''} para &ldquo;<strong>{q}</strong>&rdquo;
          </p>
        )}
      </div>

      {/* Campo de busca */}
      <form method="GET" className="mb-6">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar em todas as notícias... (ex: reforma tributária AND imposto)"
            className="w-full h-11 pl-10 pr-4 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus={!q}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Suporte a operadores: AND, OR, NOT. Ex: &ldquo;lula AND economia NOT bolsonaro&rdquo;</p>
      </form>

      {!q ? (
        <div className="text-center py-16 text-gray-400">
          <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Digite um termo para buscar</p>
          <p className="text-sm mt-1">Pesquise em todas as notícias coletadas</p>
        </div>
      ) : news.length > 0 ? (
        <>
          <div className="grid gap-3">
            {news.map((item: any) => (
              <NewsCard
                key={item.id}
                news={item}
                isFavorited={favoritedIds.has(item.id)}
                isRead={readIds.has(item.id)}
                keywords={keywords}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {page > 1 && (
                <a href={`?q=${encodeURIComponent(q)}&page=${page - 1}`} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  ← Anterior
                </a>
              )}
              <span className="px-4 py-2 text-sm text-gray-500">Página {page} de {totalPages}</span>
              {page < totalPages && (
                <a href={`?q=${encodeURIComponent(q)}&page=${page + 1}`} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  Próxima →
                </a>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">Nenhum resultado encontrado</p>
          <p className="text-sm mt-1">Tente outros termos de busca.</p>
        </div>
      )}
    </div>
  )
}
