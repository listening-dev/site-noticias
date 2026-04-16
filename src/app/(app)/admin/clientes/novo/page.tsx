import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewClientForm } from '@/components/admin/new-client-form'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default async function NovoClientePage() {
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
        <h2 className="text-2xl font-bold text-gray-900">Novo cliente</h2>
        <p className="text-sm text-gray-500 mt-1">
          Cadastre nome e descrição. Você configura filtros, fontes e usuários na próxima tela.
        </p>
      </div>

      <NewClientForm />
    </div>
  )
}
