import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronRight, Plus, Users } from 'lucide-react'

export default async function ClientesAdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .schema('noticias')
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/')

  const { data: clients } = await supabase
    .schema('noticias')
    .from('clients')
    .select('*, client_filters(id, label, active), client_sources(source_id)')
    .order('name')

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Clientes</h2>
          <p className="text-sm text-gray-500 mt-1">{clients?.length ?? 0} clientes cadastrados</p>
        </div>
        <Link href="/admin/clientes/novo">
          <Button>
            <Plus size={16} /> Novo cliente
          </Button>
        </Link>
      </div>

      <div className="grid gap-3">
        {(clients ?? []).map((client: any) => {
          const totalFilters = client.client_filters?.length ?? 0
          const activeFilters = (client.client_filters ?? []).filter((f: any) => f.active).length
          const linkedSources = client.client_sources?.length ?? 0
          const hasProblem = activeFilters === 0

          return (
            <Link
              key={client.id}
              href={`/admin/clientes/${client.id}`}
              className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-blue-500" />
                    <h3 className="font-semibold text-gray-900 truncate">{client.name}</h3>
                    {hasProblem && (
                      <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                        sem filtro ativo
                      </Badge>
                    )}
                  </div>
                  {client.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-1">{client.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                    <Badge variant="secondary">
                      {activeFilters}/{totalFilters} filtros ativos
                    </Badge>
                    <Badge variant="secondary">
                      {linkedSources === 0 ? 'todas as fontes' : `${linkedSources} fontes`}
                    </Badge>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 shrink-0" />
              </div>
            </Link>
          )
        })}
        {(clients ?? []).length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            Nenhum cliente cadastrado.
          </div>
        )}
      </div>
    </div>
  )
}
