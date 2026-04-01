import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

export default async function UsuariosAdminPage() {
  const supabase = await createClient()

  const { data: profile } = await supabase.schema('noticias').from('user_profiles').select('role').single()
  if (profile?.role !== 'admin') redirect('/')

  const { data: users } = await supabase
    .schema('noticias')
    .from('user_profiles')
    .select('*, user_clients(client_id, clients(name))')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Usuários</h2>
        <p className="text-sm text-gray-500 mt-1">{users?.length ?? 0} usuários cadastrados</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Perfil</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Clientes vinculados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(users ?? []).map((user: any) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{user.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role === 'admin' ? 'Administrador' : 'Analista'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {user.user_clients && user.user_clients.length > 0
                      ? user.user_clients.map((uc: any) => (
                          <Badge key={uc.client_id} variant="outline" className="text-xs">
                            {uc.clients?.name}
                          </Badge>
                        ))
                      : <span className="text-gray-400 text-xs">Nenhum cliente</span>
                    }
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Para vincular usuários a clientes, use o painel do Supabase (tabela user_clients).
      </p>
    </div>
  )
}
