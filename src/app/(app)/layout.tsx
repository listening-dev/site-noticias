export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Buscar perfil do usuário
  const { data: profile } = await supabase
    .schema('noticias')
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Se admin, buscar todos os clientes; senão buscar apenas os vinculados ao usuário
  let allClients: any[] = []
  if (profile?.role === 'admin') {
    const { data: all } = await supabase.schema('noticias').from('clients').select('*').order('name')
    allClients = all ?? []
  } else {
    const { data: ucRows } = await supabase
      .schema('noticias')
      .from('user_clients')
      .select('client_id')
      .eq('user_id', user.id)
    const clientIds = (ucRows ?? []).map((r: any) => r.client_id)
    if (clientIds.length > 0) {
      const { data } = await supabase
        .schema('noticias')
        .from('clients')
        .select('*')
        .in('id', clientIds)
        .order('name')
      allClients = data ?? []
    }
  }

  return (
    <div className="flex h-full">
      <Sidebar clients={allClients} profile={profile} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  )
}
