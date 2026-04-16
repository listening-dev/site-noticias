import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { booleanQueryToTsquery, isValidBooleanQuery } from '@/services/boolean-search'
import { validateTsquery } from '@/services/jsonb-search'

/**
 * POST /api/admin/filters/preview
 *
 * Preview ao vivo de quantas e quais notícias uma booleana casaria,
 * sem salvar nada. Respeita restrição de source_ids (modo Y estrito).
 *
 * Body:
 *   booleanQuery: string    — query do usuário (AND/OR/NOT/frases)
 *   sourceIds?:  string[]   — se informado, restringe às fontes
 *   windowDays?: number     — janela em dias (default 30)
 *   excludeFilterId?: string — ao editar, exclui notícias já casadas
 *                              por esta versão do filtro para calcular diff
 *
 * Retorna:
 *   ok: true
 *   total: number
 *   sample: [{ id, title, published_at, source_name }]
 *   tsquery: string
 *   warning?: string — ex: "query virou vazia após tokenização"
 */
export async function POST(request: NextRequest) {
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
  const booleanQuery: string = body.booleanQuery ?? ''
  const sourceIds: string[] | undefined = Array.isArray(body.sourceIds) ? body.sourceIds : undefined
  const windowDays: number = clampWindow(body.windowDays)

  if (!booleanQuery.trim()) {
    return NextResponse.json({
      ok: false,
      error: 'Query vazia',
    })
  }

  if (!isValidBooleanQuery(booleanQuery)) {
    return NextResponse.json({
      ok: false,
      error: 'Sintaxe da booleana inválida',
    })
  }

  const tsquery = booleanQueryToTsquery(booleanQuery)
  const validation = validateTsquery(tsquery)
  if (!validation.valid) {
    return NextResponse.json({
      ok: false,
      error: validation.error ?? 'Tsquery inválida',
      tsquery,
    })
  }

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
  const service = createServiceClient()

  const { data: matches, error: rpcError } = await service
    .schema('noticias')
    .rpc('match_news_by_tsquery_safe', {
      tsquery_text: tsquery,
      since_date: since,
      fallback_to_simple: false,
      source_ids: sourceIds && sourceIds.length > 0 ? sourceIds : null,
    })

  if (rpcError) {
    console.error('[Preview] RPC error:', rpcError)
    return NextResponse.json({
      ok: false,
      error: rpcError.message ?? 'Erro ao executar tsquery',
      tsquery,
    })
  }

  const ids = (matches ?? []).map((m: { id: string }) => m.id)
  const total = ids.length

  if (total === 0) {
    return NextResponse.json({
      ok: true,
      total: 0,
      sample: [],
      tsquery,
      warning: 'Nenhum match. Revise os termos ou expanda a janela.',
    })
  }

  const sampleIds = ids.slice(0, 20)
  const { data: sampleNews } = await service
    .schema('noticias')
    .from('news')
    .select('id, title, url, published_at, sources(name)')
    .in('id', sampleIds)
    .order('published_at', { ascending: false })

  const sample = (sampleNews ?? []).map((n: any) => ({
    id: n.id,
    title: n.title,
    url: n.url,
    published_at: n.published_at,
    source_name: n.sources?.name ?? null,
  }))

  return NextResponse.json({ ok: true, total, sample, tsquery })
}

function clampWindow(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 30
  return Math.max(1, Math.min(180, Math.trunc(n)))
}
