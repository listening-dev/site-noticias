import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Newspaper, Users, Rss, TrendingUp } from 'lucide-react'
import { BackfillTopicsWidget } from '@/components/admin/backfill-topics-widget'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: profile } = await supabase.schema('noticias').from('user_profiles').select('role').single()
  if (profile?.role !== 'admin') redirect('/')

  const [
    { count: newsCount },
    { count: clientCount },
    { count: sourceCount },
    { count: userCount },
    { count: topicsCount },
  ] = await Promise.all([
    supabase.schema('noticias').from('news').select('*', { count: 'exact', head: true }),
    supabase.schema('noticias').from('clients').select('*', { count: 'exact', head: true }),
    supabase.schema('noticias').from('sources').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.schema('noticias').from('user_profiles').select('*', { count: 'exact', head: true }),
    supabase.schema('noticias').from('news_topics').select('*', { count: 'exact', head: true }),
  ])

  // Top clientes por volume de notícias
  const { data: topClients } = await supabase
    .schema('noticias')
    .from('client_news')
    .select('client_id, clients(name)')
    .limit(100)

  const clientVolume: Record<string, { name: string; count: number }> = {}
  ;(topClients ?? []).forEach((cn: any) => {
    const id = cn.client_id
    const name = cn.clients?.name ?? id
    clientVolume[id] = { name, count: (clientVolume[id]?.count ?? 0) + 1 }
  })

  const topClientsSorted = Object.values(clientVolume).sort((a, b) => b.count - a.count).slice(0, 5)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard Administrativo</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Newspaper className="h-5 w-5 text-blue-600" />} label="Notícias coletadas" value={newsCount ?? 0} />
        <StatCard icon={<Users className="h-5 w-5 text-green-600" />} label="Clientes" value={clientCount ?? 0} />
        <StatCard icon={<Rss className="h-5 w-5 text-orange-600" />} label="Fontes ativas" value={sourceCount ?? 0} />
        <StatCard icon={<Users className="h-5 w-5 text-purple-600" />} label="Usuários" value={userCount ?? 0} />
      </div>

      {topClientsSorted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={18} />
              Top Clientes por Volume de Notícias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topClientsSorted.map((client, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-700">{client.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{client.count} notícias</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-4">
        <BackfillTopicsWidget
          initialTotal={newsCount ?? 0}
          initialProcessed={topicsCount ?? 0}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <a href="/admin/fontes" className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all">
          <Rss className="h-6 w-6 text-orange-500 mb-2" />
          <p className="font-semibold text-gray-900">Gerenciar Fontes RSS</p>
          <p className="text-xs text-gray-500 mt-0.5">Adicionar e editar portais</p>
        </a>
        <a href="/admin/clientes" className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all">
          <Users className="h-6 w-6 text-green-500 mb-2" />
          <p className="font-semibold text-gray-900">Gerenciar Clientes</p>
          <p className="text-xs text-gray-500 mt-0.5">Configurar filtros booleanos</p>
        </a>
        <a href="/admin/usuarios" className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all">
          <Users className="h-6 w-6 text-purple-500 mb-2" />
          <p className="font-semibold text-gray-900">Gerenciar Usuários</p>
          <p className="text-xs text-gray-500 mt-0.5">Vincular analistas a clientes</p>
        </a>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value.toLocaleString('pt-BR')}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}
