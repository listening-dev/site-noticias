import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchAllFeeds } from '@/services/feed-fetcher'
import { matchNewsForAllClients } from '@/services/news-matcher'
import { processNewsTopicsBatch } from '@/services/topic-processor'

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
    console.log('[Cron] Iniciando coleta de feeds RSS...')
    const feedResults = await fetchAllFeeds(supabase)

    const totalInserted = feedResults.reduce((sum, r) => sum + r.inserted, 0)
    console.log(`[Cron] Feeds coletados. Total inserido: ${totalInserted}`)

    console.log('[Cron] Iniciando matching de notícias com clientes...')
    const matchResults = await matchNewsForAllClients(supabase)

    const totalMatched = matchResults.reduce((sum, r) => sum + r.matched, 0)
    console.log(`[Cron] Matching concluído. Total matched: ${totalMatched}`)

    // Processar tópicos das notícias inseridas recentemente
    console.log('[Cron] Iniciando extração de tópicos com OpenAI...')
    const recentNews = await supabase
      .schema('noticias')
      .from('news')
      .select('id, title, description')
      .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50)

    const topicResults =
      recentNews.data && recentNews.data.length > 0
        ? await processNewsTopicsBatch(supabase, recentNews.data, 3)
        : []

    const successfulTopicProcessing = topicResults.filter((r) => r.success).length
    console.log(
      `[Cron] Tópicos processados: ${successfulTopicProcessing}/${topicResults.length}`
    )

    return NextResponse.json({
      success: true,
      feeds: feedResults,
      totalInserted,
      matching: matchResults,
      totalMatched,
      topicProcessing: {
        processed: successfulTopicProcessing,
        total: topicResults.length,
        errors: topicResults.filter((r) => !r.success).map((r) => r.error),
      },
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
