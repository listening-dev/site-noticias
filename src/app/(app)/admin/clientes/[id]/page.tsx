import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientEditor } from '@/components/admin/client-editor'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditClientePage({ params }: Props) {
  const { id } = await params
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

  const [
    { data: client },
    { data: filters },
    { data: clientSources },
    { data: userClients },
    { data: allSources },
    { data: allUsers },
  ] = await Promise.all([
    supabase.schema('noticias').from('clients').select('*').eq('id', id).single(),
    supabase
      .schema('noticias')
      .from('client_filters')
      .select('*')
      .eq('client_id', id)
      .order('created_at'),
    supabase.schema('noticias').from('client_sources').select('source_id').eq('client_id', id),
    supabase.schema('noticias').from('user_clients').select('user_id').eq('client_id', id),
    supabase.schema('noticias').from('sources').select('id, name, category').order('name'),
    supabase
      .schema('noticias')
      .from('user_profiles')
      .select('id, email, full_name, role')
      .order('email'),
  ])

  if (!client) notFound()

  const initialFilters = (filters ?? []).map((f: any) => ({
    id: f.id,
    label: f.label ?? '',
    boolean_query: f.boolean_query ?? '',
    active: f.active ?? true,
  }))

  const initialSourceIds = (clientSources ?? []).map((r: any) => r.source_id as string)
  const initialUserIds = (userClients ?? []).map((r: any) => r.user_id as string)

  const mappedUsers = (allUsers ?? []).map((u: any) => ({
    id: u.id,
    name: u.full_name || u.email || u.id,
    email: u.email,
    role: u.role,
  }))

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/admin/clientes"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={14} /> Clientes
        </Link>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{client.name}</h2>
        {client.description && (
          <p className="text-sm text-gray-500 mt-1">{client.description}</p>
        )}
      </div>

      <ClientEditor
        clientId={id}
        initialName={client.name}
        initialDescription={client.description}
        initialFilters={initialFilters}
        initialSourceIds={initialSourceIds}
        initialUserIds={initialUserIds}
        allSources={(allSources ?? []) as any}
        allUsers={mappedUsers}
      />
    </div>
  )
}
