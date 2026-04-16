import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { reprocessClient } from '@/services/news-matcher'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const userClient = await createClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data: profile } = await userClient
    .schema('noticias')
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admins' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const windowDays = clampWindow(body.windowDays)
  const filterId = typeof body.filterId === 'string' ? body.filterId : undefined

  const service = createServiceClient()

  try {
    const result = await reprocessClient(service, id, windowDays, filterId)
    return NextResponse.json({ success: true, windowDays, ...result })
  } catch (error) {
    console.error('[Reprocessar] erro:', error)
    return NextResponse.json({ error: 'Erro ao reprocessar' }, { status: 500 })
  }
}

function clampWindow(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 30
  return Math.max(1, Math.min(365, Math.trunc(n)))
}
