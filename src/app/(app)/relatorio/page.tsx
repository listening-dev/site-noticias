import { createClient } from '@/lib/supabase/server'
import { ReportContent } from '@/components/report/report-content'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; client?: string }>
}

function aggregateByKey<T>(items: T[], keyFn: (item: T) => string): { name: string; count: number }[] {
  const map = new Map<string, number>()
  for (const item of items) {
    const key = keyFn(item)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

function aggregateByDay(items: { published_at: string | null }[]): { date: string; count: number }[] {
  const map = new Map<string, number>()
  for (const item of items) {
    if (!item.published_at) continue
    const day = format(new Date(item.published_at), 'dd/MM', { locale: ptBR })
    map.set(day, (map.get(day) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
}

export default async function RelatorioPage({ searchParams }: PageProps) {
  const params = await searchParams

  const now = new Date()
  const to = params.to ? new Date(params.to) : now
  const from = params.from ? new Date(params.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const clientId = params.client || null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Buscar perfil para saber se é admin
  const { data: profile } = await supabase
    .schema('noticias')
    .from('user_profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  // Buscar clientes acessíveis
  let clients: any[] = []
  if (profile?.role === 'admin') {
    const { data } = await supabase.schema('noticias').from('clients').select('*').order('name')
    clients = data ?? []
  } else {
    const { data: userClients } = await supabase
      .schema('noticias')
      .from('user_clients')
      .select('client_id, clients(*)')
      .eq('user_id', user!.id)
    clients = (userClients ?? []).map((uc: any) => uc.clients).filter(Boolean)
  }

  const selectedClient = clientId ? clients.find((c: any) => c.id === clientId) : null

  // Buscar todas as notícias do período via paginação em range (evita o cap de 1000 do PostgREST).
  // newsItems é usado apenas para topTitles (30 primeiros); agregações usam count exato.
  let newsItems: any[] = []
  let totalNews = 0

  if (clientId) {
    // Filtrar por cliente: buscar via client_news
    const { data: clientNews, count } = await supabase
      .schema('noticias')
      .from('client_news')
      .select('news(*, sources(*))', { count: 'exact' })
      .eq('client_id', clientId)
      .gte('matched_at', from.toISOString())
      .lte('matched_at', to.toISOString())
      .range(0, 9999)

    newsItems = (clientNews ?? []).map((cn: any) => cn.news).filter(Boolean)
    totalNews = count ?? newsItems.length
  } else {
    // Global: buscar apenas fontes visíveis na visão geral
    const { data: visibleSources } = await supabase
      .schema('noticias')
      .from('sources')
      .select('id')
      .eq('active', true)
      .eq('visible_in_overview', true)

    const visibleIds = (visibleSources ?? []).map((s: any) => s.id)

    const { data, count } = await supabase
      .schema('noticias')
      .from('news')
      .select('*, sources(*)', { count: 'exact' })
      .in('source_id', visibleIds)
      .gte('published_at', from.toISOString())
      .lte('published_at', to.toISOString())
      .order('published_at', { ascending: false })
      .range(0, 9999)

    newsItems = data ?? []
    totalNews = count ?? newsItems.length
  }

  // Agregações sobre o conjunto retornado (até 10000 rows — suficiente pra qualquer período)
  const sourceStats = aggregateByKey(newsItems, (n: any) => n.sources?.name ?? 'Desconhecido')
  const categoryStats = aggregateByKey(newsItems, (n: any) => n.category ?? 'Sem categoria')
  const timelineStats = aggregateByDay(newsItems)

  // Top títulos para contexto da IA
  const topTitles = newsItems.slice(0, 30).map((n: any) => ({
    title: n.title,
    source: n.sources?.name ?? '',
  }))

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Relatório</h2>
        <p className="text-sm text-gray-500 mt-1">
          Análise do período selecionado
          {selectedClient && <span className="font-medium text-blue-600"> — {selectedClient.name}</span>}
        </p>
      </div>

      <ReportContent
        from={from.toISOString()}
        to={to.toISOString()}
        totalNews={totalNews}
        sourceStats={sourceStats}
        categoryStats={categoryStats}
        timelineStats={timelineStats}
        topTitles={topTitles}
        clients={clients}
        selectedClientId={clientId}
        selectedClientName={selectedClient?.name ?? null}
      />
    </div>
  )
}
