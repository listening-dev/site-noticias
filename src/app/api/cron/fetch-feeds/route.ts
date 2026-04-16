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

    // [Optimization #3] Parallelize matching + topic extraction
    // These are independent operations that can run in parallel
    // BEFORE: await matchResults then await topicResults (sequential)
    // AFTER: await both in parallel
    console.log('[Cron] Iniciando matching + extração de tópicos em paralelo...')

    // Pick 50 most recent news that are NOT yet in news_topics.
    // Isso garante catch-up automático se um ciclo anterior tiver falhado,
    // e evita chamadas OpenAI redundantes sobre notícias já processadas.
    const pendingTopicsPromise = (async () => {
      const { data: processed } = await supabase
        .schema('noticias')
        .from('news_topics')
        .select('news_id')
      const processedIds = new Set((processed ?? []).map((r: any) => r.news_id))

      const { data: candidates } = await supabase
        .schema('noticias')
        .from('news')
        .select('id, title, description')
        .order('created_at', { ascending: false })
        .limit(50 + processedIds.size)

      return (candidates ?? []).filter((n: any) => !processedIds.has(n.id)).slice(0, 50)
    })()

    // Execute matching + fetch pending news in parallel
    const [matchResults, pendingNews] = await Promise.all([
      matchNewsForAllClients(supabase),
      pendingTopicsPromise,
    ])

    const totalMatched = matchResults.reduce((sum, r) => sum + r.matched, 0)
    console.log(`[Cron] Matching concluído. Total matched: ${totalMatched}`)

    console.log(`[Cron] Extraindo tópicos OpenAI em ${pendingNews.length} notícias não processadas...`)
    const topicResults =
      pendingNews.length > 0 ? await processNewsTopicsBatch(supabase, pendingNews as any) : []

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
