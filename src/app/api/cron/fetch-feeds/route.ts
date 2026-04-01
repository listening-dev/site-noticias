import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAllFeeds } from '@/services/feed-fetcher'
import { matchNewsForAllClients } from '@/services/news-matcher'

export const maxDuration = 60 // segundos (Netlify/Vercel)

export async function GET(request: NextRequest) {
  // Proteção simples por chave secreta
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const supabase = createServiceClient()

  try {
    console.log('[Cron] Iniciando coleta de feeds RSS...')
    const feedResults = await fetchAllFeeds(supabase)

    const totalInserted = feedResults.reduce((sum, r) => sum + r.inserted, 0)
    console.log(`[Cron] Feeds coletados. Total inserido: ${totalInserted}`)

    console.log('[Cron] Iniciando matching de notícias com clientes...')
    const matchResults = await matchNewsForAllClients(supabase)

    const totalMatched = matchResults.reduce((sum, r) => sum + r.matched, 0)
    console.log(`[Cron] Matching concluído. Total matched: ${totalMatched}`)

    return NextResponse.json({
      success: true,
      feeds: feedResults,
      totalInserted,
      matching: matchResults,
      totalMatched,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Erro geral:', error)
    return NextResponse.json(
      { error: 'Erro interno ao processar feeds' },
      { status: 500 }
    )
  }
}
