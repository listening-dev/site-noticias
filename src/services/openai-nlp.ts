import { OpenAI } from 'openai'

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
  const content = `${title}\n${description || ''}`

  const prompt = `Analise a seguinte notícia em português e extraia:

1. Tópicos principais (máx 5, com confidence 0-1)
2. Entidades mencionadas (pessoas, organizações, locais)
3. Sentimento geral (positivo, neutro ou negativo)
4. Categoria (economia, política, tecnologia, saúde, esportes, outros)

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

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Sem resposta do OpenAI')
    }

    // Limpar markdown se houver
    const jsonStr = content
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
    // Retornar valores padrão em caso de erro
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
  if (themes.length === 0) return []
  if (themes.length === 1)
    return [
      {
        cluster_name: themes[0].name,
        members: [themes[0].name],
        confidence: themes[0].confidence,
      },
    ]

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
      return themes.map((t) => ({
        cluster_name: t.name,
        members: [t.name],
        confidence: t.confidence,
      }))
    }

    const jsonStr = content
      .replace(/^```json?\n/, '')
      .replace(/\n```$/, '')
      .trim()

    const result = JSON.parse(jsonStr)
    return result.clusters || []
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
