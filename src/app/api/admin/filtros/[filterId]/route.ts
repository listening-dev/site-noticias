import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { isValidBooleanQuery } from '@/services/boolean-search'

/**
 * PATCH /api/admin/filtros/[filterId]
 * Body: { label?, boolean_query?, active? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ filterId: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { filterId } = await params
  const body = await request.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if (typeof body.label === 'string') patch.label = body.label.trim() || null
  if (body.label === null) patch.label = null
  if (typeof body.boolean_query === 'string') {
    const q = body.boolean_query.trim()
    if (!q) return NextResponse.json({ error: 'boolean_query vazia' }, { status: 400 })
    if (!isValidBooleanQuery(q)) {
      return NextResponse.json({ error: 'Sintaxe da booleana inválida' }, { status: 400 })
    }
    patch.boolean_query = q
    patch.tsquery_value = null // força recompute no próximo match
  }
  if (typeof body.active === 'boolean') patch.active = body.active

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .schema('noticias')
    .from('client_filters')
    .update(patch)
    .eq('id', filterId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/admin/filtros/[filterId]
 *
 * Remove o filtro e todos os client_news vinculados a ele.
 * Os client_news perdem referência (filter_id SET NULL via FK), mas
 * idealmente deveriam sumir — apagamos explicitamente matches que só
 * foram criados por este filtro (ou seja, sem outro filter referenciando
 * a mesma notícia).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ filterId: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { filterId } = await params
  const service = createServiceClient()

  // Apaga matches deste filtro específico (outros filtros podem ter
  // matcheado as mesmas notícias — aqueles permanecem via seus próprios
  // rows; aqui cada linha é unique por (client_id, news_id) então só
  // existe um row, e a FK é SET NULL. Para consistência, deletamos matches
  // onde filter_id == este.)
  await service.schema('noticias').from('client_news').delete().eq('filter_id', filterId)

  const { error } = await service
    .schema('noticias')
    .from('client_filters')
    .delete()
    .eq('id', filterId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
