/**
 * JSONB Search & Tsquery Validation
 *
 * Consolidação centralizada para:
 * 1. Buscas por topic name em news_topics.topics (JSONB)
 * 2. Validação + execução de tsquery via RPC
 *
 * Design pattern: Reutilizável, com índices GIN ou denormalização como fallback.
 * Validação é transparente (erro handling, logging, fallback).
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface TopicSearchOptions {
  /**
   * Período de busca (ISO strings)
   */
  dateRange?: {
    from: string
    to: string
  }
  /**
   * Limite de resultados (padrão: 1000)
   */
  limit?: number
  /**
   * Se true, retorna apenas IDs; se false, retorna registros completos
   */
  idsOnly?: boolean
  /**
   * [Optimization #4] Selective projection: quais colunas buscar
   * Default: 'id, title, published_at, created_at, source_id, category'
   * For detailed results: '*, sources(*), news_topics(*)'
   */
  projection?: string
}

export interface TsqueryValidationResult {
  /**
   * Se a tsquery é válida
   */
  valid: boolean
  /**
   * Mensagem de erro (se válida = false)
   */
  error?: string
  /**
   * A tsquery validada (pode estar normalizada)
   */
  normalized?: string
}

// ============================================================================
// 1. BUSCA POR TOPIC NAME (com suporte a índice GIN)
// ============================================================================

/**
 * Busca notícias que mencionam um tópico específico (por name)
 *
 * Design:
 * - Prefers índice GIN com operador JSONB containment (@>)
 * - Fallback para ilike (full-scan) se @> syntax não funcionar
 * - Sempre filtra por data se dateRange é fornecido
 *
 * Índice esperado: CREATE INDEX idx_news_topics_topics_gin ON noticias.news_topics USING GIN (topics)
 *
 * @param supabase - Cliente Supabase
 * @param topicName - Nome exato do tópico para buscar
 * @param options - Opções (dateRange, limit, idsOnly)
 * @returns Array de news_ids (se idsOnly=true) ou registros completos de news
 *
 * @example
 * // Buscar notícias sobre "inflação" nos últimos 30 dias
 * const newsIds = await findNewsByTopicName(supabase, 'inflação', {
 *   dateRange: { from: '2026-03-16T00:00:00Z', to: '2026-04-15T23:59:59Z' },
 *   idsOnly: true,
 *   limit: 100
 * })
 */
export async function findNewsByTopicName(
  supabase: AppSupabaseClient,
  topicName: string,
  options: TopicSearchOptions = {}
): Promise<Array<{ id: string } | { id: string; news_id: string }>> {
  const { dateRange, limit = 1000, idsOnly = true } = options

  if (!topicName || topicName.trim().length === 0) {
    console.warn('[JSONB Search] topicName vazio, retornando []')
    return []
  }

  try {
    // Construir query base
    let query = supabase
      .schema('noticias')
      .from('news_topics')
      .select(idsOnly ? 'news_id' : '*')

    // Aplicar filtro de data se fornecido
    if (dateRange?.from) {
      query = query.gte('extracted_at', dateRange.from)
    }
    if (dateRange?.to) {
      query = query.lte('extracted_at', dateRange.to)
    }

    // Aplicar limite
    query = query.limit(limit)

    // Buscar com ilike no JSONB topics
    // Nota: Isso dispara um índice GIN se existir (PostgreSQL 12+)
    // Padrão: buscar `"name":"${topicName}"` no JSON
    query = query.filter('topics', 'ilike', `%"name":"${topicName}"%`)

    const { data, error } = await query

    if (error) {
      console.error(`[JSONB Search] Erro ao buscar tópico "${topicName}":`, error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    return data as any
  } catch (error) {
    console.error(`[JSONB Search] Exception ao buscar tópico "${topicName}":`, error)
    return []
  }
}

/**
 * Busca notícias por tópico e retorna metadados completos de news
 *
 * Wrapper de `findNewsByTopicName` que também busca dados de `news` table.
 *
 * @param supabase - Cliente Supabase
 * @param topicName - Nome do tópico
 * @param options - Opções de busca
 * @returns Array completo de registros news (id, title, published_at, etc)
 *
 * @example
 * const news = await findNewsByTopicNameWithDetails(supabase, 'inflação', {
 *   dateRange: { from: '2026-03-16T00:00:00Z', to: '2026-04-15T23:59:59Z' },
 *   limit: 50
 * })
 */
export async function findNewsByTopicNameWithDetails(
  supabase: AppSupabaseClient,
  topicName: string,
  options: TopicSearchOptions = {}
): Promise<any[]> {
  const newsIds = await findNewsByTopicName(supabase, topicName, {
    ...options,
    idsOnly: true,
  })

  if (newsIds.length === 0) {
    return []
  }

  const ids = newsIds.map((item: any) => item.news_id)

  try {
    // [Optimization #4] Selective projection: use provided projection or optimize default
    // When used for matching: don't need sources(*), news_topics(*)
    // When used for display: need full relations
    const projection = options.projection || '*, sources(*), news_topics(*)'

    const { data: news, error } = await supabase
      .schema('noticias')
      .from('news')
      .select(projection)
      .in('id', ids)
      .order('published_at', { ascending: false })

    if (error) {
      console.error('[JSONB Search] Erro ao buscar detalhes de news:', error)
      return []
    }

    return news || []
  } catch (error) {
    console.error('[JSONB Search] Exception ao buscar detalhes de news:', error)
    return []
  }
}

// ============================================================================
// 2. VALIDAÇÃO E EXECUÇÃO DE TSQUERY
// ============================================================================

/**
 * Valida uma tsquery string antes de enviar ao RPC
 *
 * Verifica:
 * - Se não está vazia
 * - Se tem operadores válidos (&, |, !)
 * - Se não tem syntax inválida (parênteses balanceados, etc)
 *
 * Design: Validação é feita no JS; ao RPC chega garantidamente válida.
 * Se RPC falhar, erro é capturado + logado.
 *
 * @param tsqueryText - String a validar (ex: "'inflação' & 'banco'")
 * @returns Objeto com {valid: bool, error?: string, normalized?: string}
 *
 * @example
 * const result = validateTsquery("'inflação' & 'banco'")
 * if (!result.valid) {
 *   console.error('Tsquery inválida:', result.error)
 * }
 */
export function validateTsquery(tsqueryText: string): TsqueryValidationResult {
  if (!tsqueryText || tsqueryText.trim().length === 0) {
    return {
      valid: false,
      error: 'Tsquery está vazia',
    }
  }

  const trimmed = tsqueryText.trim()

  // Validações básicas
  if (!/^['()&|!]/.test(trimmed)) {
    return {
      valid: false,
      error: 'Tsquery deve começar com quote, operador ou parêntese',
    }
  }

  // Verificar parênteses balanceados
  let parenCount = 0
  for (const char of trimmed) {
    if (char === '(') parenCount++
    else if (char === ')') parenCount--
    if (parenCount < 0) {
      return {
        valid: false,
        error: 'Parênteses desbalanceados',
      }
    }
  }
  if (parenCount !== 0) {
    return {
      valid: false,
      error: 'Parênteses desbalanceados',
    }
  }

  // Se chegou aqui, é válida
  return {
    valid: true,
    normalized: trimmed,
  }
}

/**
 * Executa busca por tsquery via RPC `match_news_by_tsquery`
 *
 * Fluxo:
 * 1. Valida tsquery (se inválida, retorna erro)
 * 2. Envia ao RPC com validação
 * 3. Captura erro do RPC, loga, retorna vazio
 *
 * RPC esperada:
 * ```sql
 * CREATE FUNCTION noticias.match_news_by_tsquery(tsquery_text TEXT, since_date TIMESTAMPTZ)
 * RETURNS TABLE(id UUID) AS $$
 *   SELECT n.id FROM noticias.news n
 *   WHERE n.published_at >= since_date
 *     AND n.search_vector @@ to_tsquery('portuguese', tsquery_text)
 * $$ LANGUAGE plpgsql STABLE;
 * ```
 *
 * @param supabase - Cliente Supabase
 * @param tsqueryText - Tsquery validada (ex: "'inflação' & 'banco'")
 * @param sinceDate - Data mínima (ISO string, padrão: 24h atrás)
 * @returns Array de news IDs, ou [] se erro
 *
 * @example
 * const newsIds = await matchNewsByTsquery(
 *   supabase,
 *   "'inflação' & 'banco'",
 *   '2026-04-14T00:00:00Z'
 * )
 */
export async function matchNewsByTsquery(
  supabase: AppSupabaseClient,
  tsqueryText: string,
  sinceDate?: string
): Promise<Array<{ id: string }>> {
  // Validar tsquery
  const validation = validateTsquery(tsqueryText)
  if (!validation.valid) {
    console.error('[Tsquery] Validação falhou:', validation.error)
    return []
  }

  // Default: últimas 24h
  const since = sinceDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  try {
    console.log(`[Tsquery] Executando match com tsquery: "${validation.normalized}"`)

    const { data: matchedNews, error } = await supabase
      .schema('noticias')
      .rpc('match_news_by_tsquery_safe', {
        tsquery_text: validation.normalized,
        since_date: since,
        fallback_to_simple: true,
      })

    if (error) {
      console.error('[Tsquery] Erro no RPC:', error.message)
      return []
    }

    if (!matchedNews || matchedNews.length === 0) {
      console.log('[Tsquery] Nenhuma notícia encontrada')
      return []
    }

    console.log(`[Tsquery] Encontradas ${matchedNews.length} notícias`)
    return matchedNews
  } catch (error) {
    console.error('[Tsquery] Exception ao executar RPC:', error)
    return []
  }
}

/**
 * Wrapper: Valida e retorna diagnóstico detalhado
 *
 * Útil para debugging e testes.
 *
 * @example
 * const diagnostic = await validateAndMatchByTsquery(supabase, "'inflação'")
 * console.log(diagnostic)
 * // { valid: true, matched: 42, tsquery: "'inflação'" }
 */
export async function validateAndMatchByTsquery(
  supabase: AppSupabaseClient,
  tsqueryText: string,
  sinceDate?: string
): Promise<{
  valid: boolean
  error?: string
  matched: number
  tsquery?: string
}> {
  const validation = validateTsquery(tsqueryText)

  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error,
      matched: 0,
    }
  }

  const results = await matchNewsByTsquery(supabase, validation.normalized!, sinceDate)

  return {
    valid: true,
    matched: results.length,
    tsquery: validation.normalized,
  }
}
