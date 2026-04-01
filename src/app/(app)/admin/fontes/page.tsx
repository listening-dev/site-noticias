import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Rss } from 'lucide-react'

export default async function FontesPage() {
  const supabase = await createClient()

  const { data: profile } = await supabase.schema('noticias').from('user_profiles').select('role').single()
  if (profile?.role !== 'admin') redirect('/')

  const { data: sources } = await supabase
    .schema('noticias')
    .from('sources')
    .select('*')
    .order('name')

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Fontes RSS</h2>
        <p className="text-sm text-gray-500 mt-1">{sources?.length ?? 0} fontes cadastradas</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Portal</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Categoria</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">URL RSS</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(sources ?? []).map((source: any) => (
              <tr key={source.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    <Rss size={14} className="text-orange-500" />
                    {source.name}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="capitalize text-xs">{source.category || '—'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <a href={source.rss_url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-xs truncate block max-w-xs">
                    {source.rss_url}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={source.active ? 'success' : 'secondary'}>
                    {source.active ? 'Ativa' : 'Inativa'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-4">
        Para adicionar ou editar fontes, execute o SQL de seed no Supabase ou use o painel do banco de dados.
      </p>
    </div>
  )
}
