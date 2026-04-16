/**
 * OpenAI NLP Service with Circuit Breaker Protection
 *
 * This is the protected version of openai-nlp.ts that includes:
 * - Circuit breaker for fail-fast behavior
 * - Fallback extraction strategies
 * - Health metrics tracking
 * - Source tracking (openai vs fallback)
 *
 * Backward compatible: Same signatures as openai-nlp.ts
 */

import { OpenAI } from 'openai'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'
import { OpenAICircuitBreaker, CircuitBreakerRegistry } from '@/lib/circuit-breaker'
import { fallbackExtractTopics } from './fallback-extraction'

type AppSupabaseClient = SupabaseClient<Database>

// Lazy initialization - OpenAI client é criado apenas quando necessário
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }
  return new OpenAI({ apiKey })
}

// Circuit breakers for different operations
let topicExtractionBreaker: OpenAICircuitBreaker | null = null
let themeClusteringBreaker: OpenAICircuitBreaker | null = null

function getTopicExtractionBreaker(): OpenAICircuitBreaker {
  if (!topicExtractionBreaker) {
    topicExtractionBreaker = new OpenAICircuitBreaker('openai-extract-topics', {
      errorRateThreshold: parseFloat(process.env.OPENAI_ERROR_THRESHOLD || '0.5'),
      consecutiveFailureThreshold: parseInt(process.env.OPENAI_CONSECUTIVE_FAILURES || '3'),
      recoveryTimeout: parseInt(process.env.OPENAI_RECOVERY_TIMEOUT || '60000'),
      halfOpenSuccessThreshold: parseInt(process.env.OPENAI_HALF_OPEN_ATTEMPTS || '2'),
      debug: process.env.OPENAI_CIRCUIT_DEBUG !== 'false',
    })
    CircuitBreakerRegistry.register('openai-extract-topics', topicExtractionBreaker)
  }
  return topicExtractionBreaker
}

function getThemeClusteringBreaker(): OpenAICircuitBreaker {
  if (!themeClusteringBreaker) {
    themeClusteringBreaker = new OpenAICircuitBreaker('openai-cluster-themes', {
      errorRateThreshold: parseFloat(process.env.OPENAI_ERROR_THRESHOLD || '0.5'),
      consecutiveFailureThreshold: parseInt(process.env.OPENAI_CONSECUTIVE_FAILURES || '3'),
      recoveryTimeout: parseInt(process.env.OPENAI_RECOVERY_TIMEOUT || '60000'),
      halfOpenSuccessThreshold: parseInt(process.env.OPENAI_HALF_OPEN_ATTEMPTS || '2'),
      debug: process.env.OPENAI_CIRCUIT_DEBUG !== 'false',
    })
    CircuitBreakerRegistry.register('openai-cluster-themes', themeClusteringBreaker)
  }
  return themeClusteringBreaker
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
  source?: 'openai' | 'fallback_cache' | 'fallback_rules' // NEW: Source tracking
  circuitState?: string // NEW: For monitoring
}

/**
 * Extrai tópicos, entidades e sentimento de uma notícia usando OpenAI
 * Com fallback para extração rule-based quando OpenAI está indisponível
 *
 * @param title - Título da notícia
 * @param description - Descrição/conteúdo da notícia
 * @param supabase - Cliente Supabase para fallback cache (optional, required if circuit open)
 * @returns Objeto com tópicos, entidades, sentimento, categoria E source
 */
export async function extractTopicsFromNews(
  title: string,
  description: string | null | undefined,
  supabase?: AppSupabaseClient
): Promise<ExtractedTopics> {
  const breaker = getTopicExtractionBreaker()
  const circuitState = breaker.getState()

  // If circuit is OPEN, use fallback immediately (fail-fast)
  if (breaker.isOpen()) {
    if (!supabase) {
      // Fallback without supabase - use rules only
      console.warn('[OpenAI-NLP] Circuit OPEN and no supabase provided, using rule-based extraction')
      const fallback = await fallbackExtractTopics(undefined as any, title, description, false)
      return {
        ...fallback,
        circuitState: 'OPEN',
      }
    }

    const fallback = await fallbackExtractTopics(supabase, title, description, true)
    return {
      ...fallback,
      circuitState: 'OPEN',
    }
  }

  // Try to call OpenAI through circuit breaker
  const { success, result, error } = await breaker.execute(async () => {
    return await callOpenAIExtractTopics(title, description)
  })

  if (success && result) {
    return {
      ...result,
      source: 'openai',
      circuitState,
    }
  }

  // If OpenAI call failed, use fallback
  console.warn('[OpenAI-NLP] OpenAI call failed, falling back to rule-based extraction:', error?.message)

  if (!supabase) {
    // Fallback without supabase
    const fallback = await fallbackExtractTopics(undefined as any, title, description, false)
    return {
      ...fallback,
      circuitState,
    }
  }

  const fallback = await fallbackExtractTopics(supabase, title, description, true)
  return {
    ...fallback,
    circuitState,
  }
}

/**
 * Internal: Call OpenAI API directly
 * This is wrapped by the circuit breaker
 */
async function callOpenAIExtractTopics(
  title: string,
  description: string | null | undefined
): Promise<Omit<ExtractedTopics, 'source' | 'circuitState'>> {
  const content = `${title}\n${description || ''}`

  const prompt = `Analise a seguinte notícia em português e extraia:

1. Tópicos principais (máx 5, com confidence 0-1)
2. Entidades mencionadas (pessoas, organizações, locais)
3. Sentimento geral (positivo, neutro ou negativo)
4. Categoria (economia, política, tecnologia, saúde, esportes, outros)

INSTRUÇÃO ESPECIAL PARA SENTIMENTO:
Analise o sentimento levando em conta:
- Tom geral da notícia (otimista, alarmista, neutro)
- Palavras-chave de impacto (crescimento, crise, inovação, etc)
- Contexto econômico/social (se positivo ou negativo)
- Citações diretas ou indiretas de stakeholders
- Prognóstico ou perspectivas mencionadas
- NÃO confunda notícia sobre assunto negativo (crime, desastre) com SENTIMENTO NEGATIVO
  * Exemplo: "Empresa anuncia lucro recorde apesar de crises" = POSITIVO, não NEGATIVO
  * Exemplo: "Economista alerta para riscos de recessão" = NEGATIVO
  * Exemplo: "Método novo testado em laboratório" = NEUTRO

Notícia:
${content}

Responda em JSON (sem markdown) com exatamente esta estrutura:
{
  "topics": [{"name": "string", "confidence": 0.0-1.0, "category": "string"}],
  "entities": [{"name": "string", "type": "PERSON|ORG|LOCATION|OTHER"}],
  "sentiment": "positive|neutral|negative",
  "category": "string"
}`

  try {
    const openai = getOpenAIClient()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // Mais determinístico para NLP
      max_tokens: 500,
    })

    const responseContent = response.choices[0]?.message?.content
    if (!responseContent) {
      throw new Error('Sem resposta do OpenAI')
    }

    // Limpar markdown se houver
    const jsonStr = responseContent
      .replace(/^```json?\n/, '')
      .replace(/\n```$/, '')
      .trim()

    const extracted = JSON.parse(jsonStr)

    // Validar resposta
    if (!extracted.topics || !Array.isArray(extracted.topics)) {
      throw new Error('Resposta inválida: tópicos não é array')
    }

    return {
      topics: extracted.topics || [],
      entities: extracted.entities || [],
      sentiment: extracted.sentiment || 'neutral',
      category: extracted.category || 'outros',
    }
  } catch (error) {
    console.error('[OpenAI-NLP] Erro ao extrair tópicos:', error)
    throw error // Rethrow to trigger circuit breaker
  }
}

/**
 * Agrupa temas similares usando clustering com OpenAI
 * Com fallback para não-agrupamento quando OpenAI está indisponível
 *
 * Útil para consolidar múltiplos tópicos em temas principais
 */
export async function clusterThemes(
  themes: Array<{ name: string; confidence: number }>
): Promise<
  Array<{
    cluster_name: string
    members: string[]
    confidence: number
    source?: 'openai' | 'fallback' // NEW: Source tracking
  }>
> {
  if (themes.length === 0) return []
  if (themes.length === 1) {
    return [
      {
        cluster_name: themes[0].name,
        members: [themes[0].name],
        confidence: themes[0].confidence,
        source: 'fallback', // Single theme doesn't need clustering
      },
    ]
  }

  const breaker = getThemeClusteringBreaker()

  // If circuit is OPEN, return simple clustering (each theme is its own cluster)
  if (breaker.isOpen()) {
    console.warn('[OpenAI-NLP] Circuit OPEN for clustering, using fallback (no clustering)')
    return themes.map((t) => ({
      cluster_name: t.name,
      members: [t.name],
      confidence: t.confidence,
      source: 'fallback' as const,
    }))
  }

  const themesList = themes.map((t) => `- ${t.name} (confidence: ${t.confidence})`).join('\n')

  const prompt = `Agrupe os seguintes temas em clusters semanticamente similares em português.

Temas:
${themesList}

Responda em JSON (sem markdown) com exatamente esta estrutura:
{
  "clusters": [
    {
      "cluster_name": "nome do cluster",
      "members": ["tema1", "tema2"],
      "confidence": 0.0-1.0
    }
  ]
}`

  const { success, result, error } = await breaker.execute(async () => {
    return await callOpenAIClusterThemes(prompt)
  })

  if (success && result) {
    return result.map((r) => ({ ...r, source: 'openai' as const }))
  }

  // Fallback: cada tema é seu próprio cluster
  console.warn('[OpenAI-NLP] Clustering call failed, using fallback:', error?.message)
  return themes.map((t) => ({
    cluster_name: t.name,
    members: [t.name],
    confidence: t.confidence,
    source: 'fallback' as const,
  }))
}

/**
 * Internal: Call OpenAI clustering API directly
 * This is wrapped by the circuit breaker
 */
async function callOpenAIClusterThemes(
  prompt: string
): Promise<
  Array<{
    cluster_name: string
    members: string[]
    confidence: number
  }>
> {
  try {
    const openai = getOpenAIClient()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Sem resposta do OpenAI')
    }

    const jsonStr = content
      .replace(/^```json?\n/, '')
      .replace(/\n```$/, '')
      .trim()

    const result = JSON.parse(jsonStr)
    return result.clusters || []
  } catch (error) {
    console.error('[OpenAI-NLP] Erro ao agrupar temas:', error)
    throw error // Rethrow to trigger circuit breaker
  }
}

/**
 * Get circuit breaker health status
 * Useful for dashboards and monitoring
 */
export function getCircuitBreakerHealth() {
  return {
    topicExtraction: getTopicExtractionBreaker().getHealth(),
    themeClustering: getThemeClusteringBreaker().getHealth(),
  }
}

/**
 * Get recent circuit breaker events for debugging
 */
export function getCircuitBreakerEvents(limit: number = 50) {
  return {
    topicExtraction: getTopicExtractionBreaker().getEvents(limit),
    themeClustering: getThemeClusteringBreaker().getEvents(limit),
  }
}

/**
 * Manually reset circuit breakers (e.g., after resolving OpenAI issue)
 * Call this after confirming OpenAI is back online
 */
export function resetCircuitBreakers() {
  getTopicExtractionBreaker().reset()
  getThemeClusteringBreaker().reset()
  console.log('[OpenAI-NLP] Circuit breakers reset')
}

/**
 * Cleanup (call when app shuts down)
 */
export function cleanupCircuitBreakers() {
  getTopicExtractionBreaker().destroy()
  getThemeClusteringBreaker().destroy()
  CircuitBreakerRegistry.destroyAll()
}
