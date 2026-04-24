import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { classifyCategoriesBatch } from '@/lib/openai-nlp-resilient'
import { TokenBudgetManager } from '@/lib/token-budget-manager'

const BATCH_SIZE = 100  // artigos por chamada ao endpoint
const OPENAI_CHUNK = 10 // artigos por chamada OpenAI

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

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
  const reset = body.reset === true

  const service = createServiceClient()

  // 1. Buscar source_ids vinculados a este cliente
  const { data: clientSources } = await service
    .schema('noticias')
    .from('client_sources')
    .select('source_id')
    .eq('client_id', id)

  const sourceIds = (clientSources ?? []).map((cs: any) => cs.source_id)
  if (sourceIds.length === 0) {
    return NextResponse.json({ error: 'Nenhuma fonte vinculada ao cliente' }, { status: 400 })
  }

  // 2. Buscar todos os IDs de notícias dessas fontes
  const { data: allNewsRaw } = await service
    .schema('noticias')
    .from('news')
    .select('id')
    .in('source_id', sourceIds)

  const allNewsIds: string[] = (allNewsRaw ?? []).map((n: any) => n.id)
  if (allNewsIds.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0 })
  }

  // 3. Se reset=true, apagar news_topics em lotes (evita limite de URL do PostgREST)
  if (reset) {
    for (let i = 0; i < allNewsIds.length; i += 200) {
      await service
        .schema('noticias')
        .from('news_topics')
        .delete()
        .in('news_id', allNewsIds.slice(i, i + 200))
    }
  }

  // 4. Descobrir quais ainda não têm news_topics — lookup em lotes de 200
  const processedRawChunks: any[] = []
  for (let i = 0; i < allNewsIds.length; i += 200) {
    const { data } = await service
      .schema('noticias')
      .from('news_topics')
      .select('news_id')
      .in('news_id', allNewsIds.slice(i, i + 200))
    if (data) processedRawChunks.push(...data)
  }

  const processedIds = new Set(processedRawChunks.map((r: any) => r.news_id))
  const unprocessedIds = allNewsIds.filter((nid) => !processedIds.has(nid))

  if (unprocessedIds.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0 })
  }

  const batchIds = unprocessedIds.slice(0, BATCH_SIZE)
  const remaining = unprocessedIds.length - batchIds.length

  // 5. Buscar dados completos do lote
  const { data: batchNews } = await service
    .schema('noticias')
    .from('news')
    .select('id, title, description')
    .in('id', batchIds)

  if (!batchNews || batchNews.length === 0) {
    return NextResponse.json({ processed: 0, remaining })
  }

  // 6. Resetar contador in-memory de tokens antes do lote
  TokenBudgetManager.getInstance().reset()

  // 7. Classificar em chunks de OPENAI_CHUNK artigos por chamada (5-10x mais rápido)
  const chunks: typeof batchNews[] = []
  for (let i = 0; i < batchNews.length; i += OPENAI_CHUNK) {
    chunks.push(batchNews.slice(i, i + OPENAI_CHUNK))
  }

  const allResults = (
    await Promise.all(chunks.map((chunk) => classifyCategoriesBatch(chunk as any)))
  ).flat()

  // 8. Atualizar news.category e criar news_topics mínimos em paralelo
  await Promise.all([
    ...allResults.map((r) =>
      service
        .schema('noticias')
        .from('news')
        .update({ category: r.category })
        .eq('id', r.id)
    ),
    service
      .schema('noticias')
      .from('news_topics')
      .upsert(
        allResults.map((r) => ({
          news_id: r.id,
          topics: [],
          entities: [],
          category: r.category,
        })),
        { onConflict: 'news_id' }
      ),
  ])

  return NextResponse.json({
    processed: allResults.length,
    remaining,
    total: allNewsIds.length,
    errors: batchNews.length - allResults.length,
  })
}
