import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/require-admin'

/**
 * PATCH /api/admin/clientes/[id]
 *
 * Atualiza dados básicos e/ou substitui conjuntos de linked sources / users.
 * Body (todos opcionais):
 *   name?: string
 *   description?: string | null
 *   sourceIds?: string[]   — substitui o conjunto inteiro
 *   userIds?: string[]     — substitui o conjunto inteiro
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const service = createServiceClient()

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (body.description === null) patch.description = null
  else if (typeof body.description === 'string') patch.description = body.description.trim() || null

  if (Object.keys(patch).length > 0) {
    const { error } = await service.schema('noticias').from('clients').update(patch).eq('id', id)
    if (error) {
      return NextResponse.json({ error: `clients: ${error.message}` }, { status: 500 })
    }
  }

  if (Array.isArray(body.sourceIds)) {
    await service.schema('noticias').from('client_sources').delete().eq('client_id', id)
    if (body.sourceIds.length > 0) {
      const rows = body.sourceIds.map((source_id: string) => ({ client_id: id, source_id }))
      const { error } = await service.schema('noticias').from('client_sources').insert(rows)
      if (error) return NextResponse.json({ error: `sources: ${error.message}` }, { status: 500 })
    }
  }

  if (Array.isArray(body.userIds)) {
    await service.schema('noticias').from('user_clients').delete().eq('client_id', id)
    if (body.userIds.length > 0) {
      const rows = body.userIds.map((user_id: string) => ({ client_id: id, user_id }))
      const { error } = await service.schema('noticias').from('user_clients').insert(rows)
      if (error) return NextResponse.json({ error: `users: ${error.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/admin/clientes/[id]
 *
 * Remove cliente e cascata: client_filters, client_sources, user_clients, client_news.
 * ON DELETE CASCADE cobre tudo.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied

  const { id } = await params
  const service = createServiceClient()

  const { error } = await service.schema('noticias').from('clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
