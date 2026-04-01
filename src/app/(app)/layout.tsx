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

  // Buscar clientes do usuário
  const { data: userClients } = await supabase
    .schema('noticias')
    .from('user_clients')
    .select('client_id, clients(*)')
    .eq('user_id', user.id)

  const clients = userClients?.map((uc: any) => uc.clients).filter(Boolean) ?? []

  // Se admin, buscar todos os clientes
  let allClients = clients
  if (profile?.role === 'admin') {
    const { data: all } = await supabase.schema('noticias').from('clients').select('*').order('name')
    allClients = all ?? []
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
