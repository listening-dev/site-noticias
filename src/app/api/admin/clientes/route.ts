import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/require-admin'

/**
 * POST /api/admin/clientes
 *
 * Cria um cliente completo em transação lógica:
 *   - clients (name, description)
 *   - client_filters[] (label, boolean_query, active)
 *   - client_sources[] (source_id)
 *   - user_clients[] (user_id)
 *
 * Retorna o id do cliente criado.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => null)
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: client, error: clientError } = await service
    .schema('noticias')
    .from('clients')
    .insert({
      name: body.name.trim(),
      description: typeof body.description === 'string' ? body.description.trim() : null,
    })
    .select('id')
    .single()

  if (clientError || !client) {
    console.error('[Admin/Clientes] create client:', clientError)
    return NextResponse.json({ error: 'Erro ao criar cliente' }, { status: 500 })
  }

  const clientId = client.id
  const errors: string[] = []

  if (Array.isArray(body.filters) && body.filters.length > 0) {
    const rows = body.filters
      .filter((f: any) => f && typeof f.boolean_query === 'string' && f.boolean_query.trim())
      .map((f: any) => ({
        client_id: clientId,
        label: typeof f.label === 'string' ? f.label.trim() || null : null,
        boolean_query: f.boolean_query.trim(),
        active: f.active !== false,
      }))
    if (rows.length > 0) {
      const { error } = await service.schema('noticias').from('client_filters').insert(rows)
      if (error) errors.push(`filters: ${error.message}`)
    }
  }

  if (Array.isArray(body.sourceIds) && body.sourceIds.length > 0) {
    const rows = body.sourceIds.map((source_id: string) => ({ client_id: clientId, source_id }))
    const { error } = await service.schema('noticias').from('client_sources').insert(rows)
    if (error) errors.push(`sources: ${error.message}`)
  }

  if (Array.isArray(body.userIds) && body.userIds.length > 0) {
    const rows = body.userIds.map((user_id: string) => ({ client_id: clientId, user_id }))
    const { error } = await service.schema('noticias').from('user_clients').insert(rows)
    if (error) errors.push(`users: ${error.message}`)
  }

  return NextResponse.json({
    id: clientId,
    warnings: errors.length > 0 ? errors : undefined,
  })
}
