import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'

export default async function ClientesAdminPage() {
  const supabase = await createClient()

  const { data: profile } = await supabase.schema('noticias').from('user_profiles').select('role').single()
  if (profile?.role !== 'admin') redirect('/')

  const { data: clients } = await supabase
    .schema('noticias')
    .from('clients')
    .select('*, client_filters(*)')
    .order('name')

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Clientes</h2>
        <p className="text-sm text-gray-500 mt-1">{clients?.length ?? 0} clientes cadastrados</p>
      </div>

      <div className="grid gap-4">
        {(clients ?? []).map((client: any) => (
          <div key={client.id} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-blue-500" />
                  <h3 className="font-semibold text-gray-900">{client.name}</h3>
                </div>
                {client.description && (
                  <p className="text-sm text-gray-500 mt-1">{client.description}</p>
                )}
              </div>
              <Badge variant="secondary">{client.client_filters?.length ?? 0} filtros</Badge>
            </div>

            {client.client_filters && client.client_filters.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filtros booleanos</p>
                {client.client_filters.map((filter: any) => (
                  <div key={filter.id} className="flex items-center gap-2">
                    <Badge variant={filter.active ? 'default' : 'secondary'} className="text-xs">
                      {filter.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    {filter.label && <span className="text-xs text-gray-500">{filter.label}:</span>}
                    <code className="text-xs bg-gray-100 rounded px-2 py-0.5 font-mono">{filter.boolean_query}</code>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <a href={`/cliente/${client.id}`}
                className="text-xs text-blue-600 hover:underline">
                Ver notícias →
              </a>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Para adicionar clientes e filtros, use o painel do Supabase (tabelas clients e client_filters).
      </p>
    </div>
  )
}
