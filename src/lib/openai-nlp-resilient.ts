import { OpenAIResilientClient, createResilientClient } from './openai-resilient-client'
import { TokenBudgetManager } from './token-budget-manager'

/**
 * Extended ExtractedTopics interface (same as in openai-nlp-tracked.ts)
 */
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
 * Lazy initialization - resilient client created on first use
 * Caches client instance to avoid recreating on each call
 */
let resilientClient: OpenAIResilientClient | null = null

function getResilientClient(): OpenAIResilientClient {
  if (!resilientClient) {
    const maxRetries = parseInt(process.env.OPENAI_MAX_RETRIES || '3', 10)
    const initialDelayMs = parseInt(process.env.OPENAI_INITIAL_DELAY_MS || '100', 10)
    const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '30000', 10)
    const enableDedup = process.env.OPENAI_ENABLE_DEDUP !== 'false'
    const enableAdaptiveTimeout = process.env.OPENAI_ENABLE_ADAPTIVE_TIMEOUT !== 'false'

    resilientClient = createResilientClient({
      maxRetries,
      initialDelayMs,
      timeoutMs,
      enableDedup,
      enableAdaptiveTimeout,
    })

    console.log(
      `[OpenAI-Resilient] Client initialized with retries=${maxRetries}, delay=${initialDelayMs}ms, timeout=${timeoutMs}ms, dedup=${enableDedup}, adaptiveTimeout=${enableAdaptiveTimeout}`
    )
  }
  return resilientClient
}

/**
 * Extract topics from news using RESILIENT client
 * Same function signature as extractTopicsFromNews() but with built-in resilience
 *
 * Key improvements over extractTopicsFromNews():
 * - Automatically retries transient errors (429, 5xx, network timeouts)
 * - Deduplicates concurrent identical requests (avoids thundering herd)
 * - Tracks token budget proactively (prevents hitting rate limits)
 * - Adapts timeout based on API health (fail-fast on degradation)
 * - Respects Retry-After header from 429 responses
 *
 * Use this for NEW code. Existing code continues to work with original version.
 *
 * @param title - News title
 * @param description - News description/content
 * @param options - Optional configuration
 *   - throwOnBudgetExceeded: if true, throw when daily token budget exceeded (default false = return empty)
 * @returns ExtractedTopics or defaults on error (backward compatible)
 *
 * @example
 *   const topics = await extractTopicsWithResilient('Breaking News', 'Details...')
 *   console.log(topics.topics) // Array of extracted topics
 *
 * @example
 *   // If you want to handle budget errors explicitly:
 *   try {
 *     const topics = await extractTopicsWithResilient(title, description, { throwOnBudgetExceeded: true })
 *   } catch (e) {
 *     if (e.message.includes('Token budget exceeded')) {
 *       // Handle budget exhaustion
 *     }
 *   }
 */
export async function extractTopicsWithResilient(
  title: string,
  description: string | null | undefined,
  options?: { throwOnBudgetExceeded?: boolean }
): Promise<ExtractedTopics> {
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
    const resilient = getResilientClient()

    const response = await resilient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    })

    const responseContent = response.choices[0]?.message?.content
    if (!responseContent) {
      throw new Error('No response content from OpenAI')
    }

    // Clean markdown if present
    const jsonStr = responseContent
      .replace(/^```json?\n/, '')
      .replace(/\n```$/, '')
      .trim()

    const extracted = JSON.parse(jsonStr)

    // Validate response structure
    if (!extracted.topics || !Array.isArray(extracted.topics)) {
      throw new Error('Invalid response: topics is not an array')
    }

    return {
      topics: extracted.topics || [],
      entities: extracted.entities || [],
      sentiment: extracted.sentiment || 'neutral',
      category: extracted.category || 'outros',
    }
  } catch (error) {
    // Check if this is a token budget error that caller wants to handle
    if (error instanceof Error && error.message.includes('Token budget exceeded')) {
      if (options?.throwOnBudgetExceeded) {
        throw error // Re-throw if explicitly requested
      }
      // Otherwise, silently return default (backward compatible)
      console.warn('[OpenAI-Resilient] Token budget exceeded, returning empty topics')
    } else {
      console.error('[OpenAI-Resilient] Erro ao extrair tópicos:', error)
    }

    // Return safe defaults (backward compatible)
    return {
      topics: [],
      entities: [],
      sentiment: 'neutral',
      category: 'outros',
    }
  }
}

/**
 * Cluster themes with resilience
 * Same as clusterThemes but with automatic retry, dedup, and token tracking
 *
 * @param themes - Array of theme objects with name and confidence
 * @returns Clustered themes or original themes on error
 */
export async function clusterThemesWithResilient(
  themes: Array<{ name: string; confidence: number }>
): Promise<
  Array<{
    cluster_name: string
    members: string[]
    confidence: number
  }>
> {
  // Handle empty input
  if (themes.length === 0) {
    return []
  }

  if (themes.length === 1) {
    return [
      {
        cluster_name: themes[0].name,
        members: [themes[0].name],
        confidence: themes[0].confidence,
      },
    ]
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

  try {
    const resilient = getResilientClient()

    const response = await resilient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1000,
    })

    const responseContent = response.choices[0]?.message?.content
    if (!responseContent) {
      // Fallback: return original themes as single-member clusters
      return themes.map((t) => ({
        cluster_name: t.name,
        members: [t.name],
        confidence: t.confidence,
      }))
    }

    const jsonStr = responseContent
      .replace(/^```json?\n/, '')
      .replace(/\n```$/, '')
      .trim()

    const result = JSON.parse(jsonStr)
    return result.clusters || []
  } catch (error) {
    console.error('[OpenAI-Resilient] Erro ao agrupar temas:', error)
    // Fallback: each theme becomes its own cluster
    return themes.map((t) => ({
      cluster_name: t.name,
      members: [t.name],
      confidence: t.confidence,
    }))
  }
}

/**
 * Get token budget status for monitoring
 * Returns comprehensive budget information
 *
 * @example
 *   const status = getTokenBudgetStatus()
 *   console.log(`Used: ${status.usedToday} / ${status.dailyLimit}`)
 *   console.log(`Reset: ${status.resetAt}`)
 */
export function getTokenBudgetStatus() {
  return TokenBudgetManager.getInstance().getStatus()
}

/**
 * Check if token budget is being exceeded
 * Useful for proactive throttling
 *
 * @returns true if approaching daily limit
 */
export function isTokenBudgetLow(): boolean {
  return TokenBudgetManager.getInstance().shouldThrottle()
}

/**
 * Get remaining token headroom
 * Useful for deciding whether to process large batches
 *
 * @returns Number of tokens remaining in daily budget
 */
export function getTokenHeadroom(): number {
  return TokenBudgetManager.getInstance().getHeadroom()
}

/**
 * Check if a specific number of tokens is affordable
 * Useful for pre-flight checks before expensive operations
 *
 * @param tokens - Number of tokens to check
 * @returns true if tokens can be afforded within daily limit
 */
export function canAffordTokens(tokens: number): boolean {
  return TokenBudgetManager.getInstance().canAfford(tokens)
}

/**
 * Reset token budget (TESTING ONLY)
 * Should not be called in production
 */
export function resetTokenBudget() {
  TokenBudgetManager.getInstance().reset()
  console.warn('[OpenAI-Resilient] Token budget reset (should only happen in tests)')
}
