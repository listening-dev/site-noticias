import { SupabaseClient } from '@supabase/supabase-js'
import { extractTopicsFromNews, clusterThemes } from './openai-nlp'
import { TokenBudgetManager } from '@/lib/token-budget-manager'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

export interface TopicProcessResult {
  news_id: string
  success: boolean
  error?: string
}

/**
 * Processa uma notícia extraindo tópicos e salvando em news_topics
 */
export async function processNewsTopic(
  supabase: AppSupabaseClient,
  newsId: string,
  title: string,
  description: string | null | undefined
): Promise<TopicProcessResult> {
  try {
    // 1. Extrair tópicos do OpenAI
    const extracted = await extractTopicsFromNews(title, description)

    // 2. Salvar em news_topics
    const { error } = await supabase
      .schema('noticias')
      .from('news_topics')
      .upsert(
        {
          news_id: newsId,
          topics: extracted.topics,
          entities: extracted.entities,
          sentiment: extracted.sentiment,
          category: extracted.category,
        },
        { onConflict: 'news_id' }
      )

    if (error) {
      throw new Error(`Erro ao salvar tópicos: ${error.message}`)
    }

    return { news_id: newsId, success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[TopicProcessor] Erro ao processar notícia ${newsId}:`, message)
    return { news_id: newsId, success: false, error: message }
  }
}

/**
 * Processa um lote de notícias em paralelo (com limite de concorrência ADAPTATIVO)
 *
 * [Optimization #2] Adaptive concurrency: Aumenta de 3→10 baseado em:
 * - Quantidade de artigos (mais artigos = mais paralelo)
 * - Token budget disponível (se baixo, reduz para poupar tokens)
 *
 * ANTES: maxConcurrency = 3 (fixo) → 50 artigos = ~17 batches = 8-10 seg
 * DEPOIS: maxConcurrency = 10 (dinâmico) → 50 artigos = ~5 batches = 3-5 seg
 */
export async function processNewsTopicsBatch(
  supabase: AppSupabaseClient,
  news: Array<{ id: string; title: string; description: string | null }>,
  maxConcurrency?: number
): Promise<TopicProcessResult[]> {
  // [Optimization #2] Calculate optimal concurrency if not provided
  if (maxConcurrency === undefined) {
    const tokenBudget = TokenBudgetManager.getInstance()
    const budgetStatus = tokenBudget.getStatus()

    // Base: scale with article count
    // Fewer articles (5): use concurrency 3
    // More articles (50+): use concurrency 10
    const articleCount = news.length
    let baseConcurrency = Math.ceil(articleCount / 5) // 1-10 based on count

    // Adjust based on token budget
    const percentUsedNum = parseFloat(budgetStatus.percentUsed)
    if (percentUsedNum >= 95) {
      // >95% budget used: minimal concurrency to avoid overages
      baseConcurrency = 1
      console.log(`[TopicProcessor] Token budget critical (${percentUsedNum}%), processing serially`)
    } else if (percentUsedNum >= 80) {
      // 80-95% budget used: reduce concurrency to save tokens
      baseConcurrency = Math.max(2, Math.floor(baseConcurrency * 0.6))
      console.log(`[TopicProcessor] Token budget warning (${budgetStatus.usedToday}/${budgetStatus.dailyLimit}), reducing concurrency to ${baseConcurrency}`)
    }

    // Cap at 10 (OpenAI rate limits)
    maxConcurrency = Math.min(10, Math.max(1, baseConcurrency))
    console.log(`[TopicProcessor] Adaptive concurrency for ${articleCount} articles: ${maxConcurrency}`)
  }

  const results: TopicProcessResult[] = []

  // Processar em paralelo com limite adaptativo
  for (let i = 0; i < news.length; i += maxConcurrency) {
    const batch = news.slice(i, i + maxConcurrency)
    const batchResults = await Promise.all(
      batch.map((n) => processNewsTopic(supabase, n.id, n.title, n.description))
    )
    results.push(...batchResults)
  }

  return results
}

/**
 * Extrai e consolida tópicos de um cliente específico
 * Usado para criar global_themes baseado em client_theme_matches
 */
export async function consolidateClientTopics(
  supabase: AppSupabaseClient,
  clientId: string,
  daysBack = 7
): Promise<void> {
  try {
    // 1. Buscar tópicos de notícias do cliente nos últimos N dias
    const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()

    const { data: clientNews } = await supabase
      .schema('noticias')
      .from('client_theme_matches')
      .select('news_id')
      .eq('client_id', clientId)
      .gte('matched_at', sinceDate)

    if (!clientNews || clientNews.length === 0) {
      console.log(`[TopicProcessor] Nenhuma notícia para cliente ${clientId}`)
      return
    }

    // 2. Buscar tópicos dessas notícias
    const newsIds = [...new Set(clientNews.map((cn) => cn.news_id))]

    const { data: newsTopics } = await supabase
      .schema('noticias')
      .from('news_topics')
      .select('topics')
      .in('news_id', newsIds)

    if (!newsTopics || newsTopics.length === 0) {
      console.log(`[TopicProcessor] Nenhum tópico extraído para cliente ${clientId}`)
      return
    }

    // 3. Consolidar tópicos
    const allTopics = newsTopics
      .flatMap((nt) => nt.topics as any[])
      .filter((t) => t && t.name)

    if (allTopics.length === 0) return

    // 4. Agrupar tópicos similares
    const clusters = await clusterThemes(allTopics)

    // 5. Salvar como global_themes
    for (const cluster of clusters) {
      await supabase
        .schema('noticias')
        .from('global_themes')
        .upsert(
          {
            name: cluster.cluster_name,
            source: 'nlp_auto',
            confidence: cluster.confidence,
            status: 'active',
          },
          { onConflict: 'name' }
        )
    }

    console.log(`[TopicProcessor] Consolidado ${clusters.length} temas para cliente ${clientId}`)
  } catch (error) {
    console.error('[TopicProcessor] Erro ao consolidar tópicos do cliente:', error)
  }
}
