import { OpenAI } from 'openai'
import {
  OpenAIErrorHandler,
  OpenAIErrorLogger,
  OpenAIRetryStrategy,
  DetailedError,
  type OpenAIErrorType,
} from './openai-error-handler'

/**
 * Interface for results with transparent error handling
 * Callers can check success flag and decide whether to use data or handle error
 */
export interface TrackedResult<T> {
  success: boolean
  data?: T
  error?: DetailedError
  /** Quality metric: useful for tracking API reliability over time */
  quality: {
    success: boolean
    errorType?: OpenAIErrorType
    severity?: string
    model: string
  }
}

/**
 * Extended ExtractedTopics with error tracking metadata
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
 * Lazy initialization - OpenAI client is created only when needed
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }
  return new OpenAI({ apiKey })
}

/**
 * Extract topics from news with explicit error handling and fallback strategy
 * Unlike extractTopicsFromNews, this returns structured error info
 * allowing callers to decide whether to accept defaults or propagate
 *
 * @param title - News title
 * @param description - News description/content
 * @returns Result with success flag, data, and error details
 */
export async function extractTopicsWithErrorTracking(
  title: string,
  description: string | null | undefined
): Promise<TrackedResult<ExtractedTopics>> {
  const model = 'gpt-4o-mini'
  const maxTokens = 500
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

  const retryStrategy = new OpenAIRetryStrategy(3, 1000, 30000)

  const result = await retryStrategy.executeWithRetry(
    async () => {
      const openai = getOpenAIClient()
      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
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
      } as ExtractedTopics
    },
    { model, maxTokens }
  )

  if (result.success && result.data) {
    return {
      success: true,
      data: result.data,
      quality: {
        success: true,
        model,
      },
    }
  }

  // Error occurred
  const error = result.error!
  return {
    success: false,
    error,
    quality: {
      success: false,
      errorType: error.type,
      severity: error.severity,
      model,
    },
  }
}

/**
 * Cluster themes with error tracking
 * Similar to clusterThemes but with explicit error handling
 */
export async function clusterThemesWithErrorTracking(
  themes: Array<{ name: string; confidence: number }>
): Promise<
  TrackedResult<
    Array<{
      cluster_name: string
      members: string[]
      confidence: number
    }>
  >
> {
  const model = 'gpt-4o-mini'
  const maxTokens = 1000

  // Handle empty input
  if (themes.length === 0) {
    return {
      success: true,
      data: [],
      quality: { success: true, model },
    }
  }

  if (themes.length === 1) {
    const singleCluster = {
      cluster_name: themes[0].name,
      members: [themes[0].name],
      confidence: themes[0].confidence,
    }
    return {
      success: true,
      data: [singleCluster],
      quality: { success: true, model },
    }
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

  const retryStrategy = new OpenAIRetryStrategy(3, 1000, 30000)

  const result = await retryStrategy.executeWithRetry(
    async () => {
      const openai = getOpenAIClient()
      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      })

      const responseContent = response.choices[0]?.message?.content
      if (!responseContent) {
        throw new Error('No response content from OpenAI')
      }

      const jsonStr = responseContent
        .replace(/^```json?\n/, '')
        .replace(/\n```$/, '')
        .trim()

      const result = JSON.parse(jsonStr)
      return result.clusters || []
    },
    { model, maxTokens }
  )

  if (result.success && result.data) {
    return {
      success: true,
      data: result.data,
      quality: {
        success: true,
        model,
      },
    }
  }

  // Error occurred
  const error = result.error!
  return {
    success: false,
    error,
    quality: {
      success: false,
      errorType: error.type,
      severity: error.severity,
      model,
    },
  }
}
