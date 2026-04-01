import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { matchNewsForAllClients } from '@/services/news-matcher'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const sinceHours = body.since_hours ?? 24

  const supabase = createServiceClient()

  try {
    const results = await matchNewsForAllClients(supabase, sinceHours)
    const totalMatched = results.reduce((sum, r) => sum + r.matched, 0)

    return NextResponse.json({ success: true, results, totalMatched })
  } catch (error) {
    console.error('[Match] Erro:', error)
    return NextResponse.json({ error: 'Erro ao fazer matching' }, { status: 500 })
  }
}
