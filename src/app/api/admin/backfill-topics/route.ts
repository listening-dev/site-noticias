import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { processNewsTopicsBatch } from '@/services/topic-processor'

export const maxDuration = 60

/**
 * POST /api/admin/backfill-topics
 *
 * Processa em lote notícias que ainda não têm entrada em news_topics,
 * rodando a extração OpenAI pra preencher sentimento/tópicos/categoria.
 *
 * Body (opcional):
 *   limit?: number  — máximo de notícias por chamada (default 100, max 300)
 *
 * Retorno:
 *   { processed, succeeded, failed, remaining }
 *
 * Uso: chamar repetidamente até remaining = 0. Cada chamada processa
 * até ~300 em até 60s (limite Netlify). Para 4000 notícias → ~14 chamadas.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const rawLimit = typeof body.limit === 'number' ? body.limit : 100
  const limit = Math.max(1, Math.min(300, Math.trunc(rawLimit)))

  const service = createServiceClient()

  // Notícias já processadas (para excluir)
  const { data: processedRows } = await service
    .schema('noticias')
    .from('news_topics')
    .select('news_id')

  const processedIds = new Set((processedRows ?? []).map((r: any) => r.news_id))

  // Buscar notícias sem tópicos (ordenadas da mais recente para a mais antiga)
  const { data: candidates } = await service
    .schema('noticias')
    .from('news')
    .select('id, title, description')
    .order('published_at', { ascending: false })
    .limit(limit + processedIds.size) // buffer pra filtrar client-side

  const pending = (candidates ?? []).filter((n: any) => !processedIds.has(n.id)).slice(0, limit)

  if (pending.length === 0) {
    return NextResponse.json({
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0,
      message: 'Nada para processar — todas as notícias já têm análise.',
    })
  }

  const results = await processNewsTopicsBatch(service, pending as any)

  const succeeded = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  // Recontar quantas ainda faltam após este lote
  const { count: totalNews } = await service
    .schema('noticias')
    .from('news')
    .select('id', { count: 'exact', head: true })
  const { count: totalProcessed } = await service
    .schema('noticias')
    .from('news_topics')
    .select('id', { count: 'exact', head: true })

  const remaining = Math.max(0, (totalNews ?? 0) - (totalProcessed ?? 0))

  return NextResponse.json({
    processed: pending.length,
    succeeded,
    failed,
    remaining,
    errors: results
      .filter((r) => !r.success)
      .slice(0, 5)
      .map((r) => ({ news_id: r.news_id, error: r.error })),
  })
}
