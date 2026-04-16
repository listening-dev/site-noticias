import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { isValidBooleanQuery } from '@/services/boolean-search'

/**
 * POST /api/admin/clientes/[id]/filtros
 *
 * Cria um filtro booleano para o cliente. Body: { label?, boolean_query, active? }
 * Retorna o id do filtro criado.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id: clientId } = await params
  const body = await request.json().catch(() => ({}))

  const booleanQuery = typeof body.boolean_query === 'string' ? body.boolean_query.trim() : ''
  if (!booleanQuery) {
    return NextResponse.json({ error: 'boolean_query é obrigatório' }, { status: 400 })
  }
  if (!isValidBooleanQuery(booleanQuery)) {
    return NextResponse.json({ error: 'Sintaxe da booleana inválida' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .schema('noticias')
    .from('client_filters')
    .insert({
      client_id: clientId,
      label: typeof body.label === 'string' ? body.label.trim() || null : null,
      boolean_query: booleanQuery,
      active: body.active !== false,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Erro' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
