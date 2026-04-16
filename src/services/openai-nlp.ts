import { OpenAI } from 'openai'
import { extractTopicsWithResilient, clusterThemesWithResilient } from '@/lib/openai-nlp-resilient'

// Lazy initialization - OpenAI client é criado apenas quando necessário
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }
  return new OpenAI({ apiKey })
}

export interface ExtractedTopics {
  topics: Array<{
    name: string
    confidence: number
    category?: string
  }>
  entities: Array<{
    name: string
    type: string
  }>
  sentiment: 'positive' | 'neutral' | 'negative'
  category: string
}

/**
 * Extrai tópicos, entidades e sentimento de uma notícia usando OpenAI
 * @param title - Título da notícia
 * @param description - Descrição/conteúdo da notícia
 * @returns Objeto com tópicos, entidades, sentimento e categoria
 */
export async function extractTopicsFromNews(
  title: string,
  description: string | null | undefined
): Promise<ExtractedTopics> {
  // Use resilient implementation with automatic retries, token budgeting, and deduplication
  // This is now backward-compatible but with built-in resilience
  try {
    return await extractTopicsWithResilient(title, description, {
      throwOnBudgetExceeded: false, // Return defaults instead of throwing
    })
  } catch (error) {
    console.error('[OpenAI-NLP] Erro ao extrair tópicos:', error)
    // Fallback to defaults on any error
    return {
      topics: [],
      entities: [],
      sentiment: 'neutral',
      category: 'outros',
    }
  }
}

/**
 * Agrupa temas similares usando clustering com OpenAI
 * Útil para consolidar múltiplos tópicos em temas principais
 */
export async function clusterThemes(
  themes: Array<{ name: string; confidence: number }>
): Promise<
  Array<{
    cluster_name: string
    members: string[]
    confidence: number
  }>
> {
  // Use resilient implementation with automatic retries and token budgeting
  try {
    return await clusterThemesWithResilient(themes)
  } catch (error) {
    console.error('[OpenAI-NLP] Erro ao agrupar temas:', error)
    // Fallback: cada tema é seu próprio cluster
    return themes.map((t) => ({
      cluster_name: t.name,
      members: [t.name],
      confidence: t.confidence,
    }))
  }
}
