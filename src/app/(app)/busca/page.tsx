import { createClient } from '@/lib/supabase/server'
import { NewsCard } from '@/components/news/news-card'
import { PeriodSelector } from '@/components/report/period-selector'
import { extractKeywords } from '@/services/boolean-search'
import { Search } from 'lucide-react'

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string; from?: string; to?: string }>
}

export default async function BuscaPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const q = sp.q
  const page = Number(sp.page) || 1
  const pageSize = 20
  const rangeFrom = (page - 1) * pageSize
  const rangeTo = rangeFrom + pageSize - 1

  const now = new Date()
  const to = sp.to ? new Date(sp.to) : now
  const from = sp.from ? new Date(sp.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let news: any[] = []
  let count = 0

  if (q && q.trim()) {
    // search_vector está unaccented (migration 011). Pra casar, a query
    // precisa ser unaccented também — senão "Conceição" nunca acha.
    const unaccentedQuery = q.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    const { data, count: total } = await supabase
      .schema('noticias')
      .from('news')
      .select('*, sources(*)', { count: 'exact' })
      .textSearch('search_vector', unaccentedQuery, { type: 'websearch', config: 'portuguese' })
      .gte('published_at', from.toISOString())
      .lte('published_at', to.toISOString())
      .order('published_at', { ascending: false })
      .range(rangeFrom, rangeTo)

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

  function buildPageUrl(p: number) {
    const qp = new URLSearchParams()
    if (q) qp.set('q', q)
    qp.set('from', from.toISOString())
    qp.set('to', to.toISOString())
    if (p > 1) qp.set('page', String(p))
    return `?${qp.toString()}`
  }

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

      <div className="mb-6">
        <PeriodSelector from={from.toISOString()} to={to.toISOString()} />
      </div>

      {/* Campo de busca */}
      <form method="GET" className="mb-6">
        <input type="hidden" name="from" value={from.toISOString()} />
        <input type="hidden" name="to" value={to.toISOString()} />
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
          <p className="text-sm mt-1">Pesquise em todas as notícias coletadas no período selecionado</p>
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
          <p className="text-lg font-medium">Nenhum resultado encontrado</p>
          <p className="text-sm mt-1">Tente outros termos de busca ou ajuste o período.</p>
        </div>
      )}
    </div>
  )
}
