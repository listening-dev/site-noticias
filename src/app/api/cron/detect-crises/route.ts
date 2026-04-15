import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { detectCrisesForAllClients, detectGlobalCrises } from '@/services/crisis-detector'

export const maxDuration = 60 // segundos (Netlify/Vercel)

export async function GET(request: NextRequest) {
  // Proteção por chave secreta via Authorization header (mais seguro)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabase = createServiceClient()

  try {
    console.log('[Cron] Iniciando detecção de crises...')

    // Detectar crises para todos os clientes (últimas 60 minutos)
    const clientCrises = await detectCrisesForAllClients(supabase, 60)
    console.log(`[Cron] Detectadas ${clientCrises.length} crises em clientes`)

    // Detectar crises globais (últimas 60 minutos)
    const globalCrises = await detectGlobalCrises(supabase, 60)
    console.log(`[Cron] Detectadas ${globalCrises.length} crises globais`)

    return NextResponse.json({
      success: true,
      clientCrises: {
        count: clientCrises.length,
        details: clientCrises,
      },
      globalCrises: {
        count: globalCrises.length,
        details: globalCrises,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Erro ao detectar crises:', error)
    return NextResponse.json(
      { error: 'Erro interno ao detectar crises' },
      { status: 500 }
    )
  }
}
