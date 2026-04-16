import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'
import { ExtractedTopics } from './openai-nlp'

type AppSupabaseClient = SupabaseClient<Database>

/**
 * Fallback Extraction Strategy - Used when OpenAI Circuit is OPEN
 *
 * Provides graceful degradation with:
 * 1. Cache-based extraction: Uses previously extracted topics for similar content
 * 2. Rule-based extraction: Pattern matching for common Portuguese topics
 * 3. Degraded confidence: Returns 0.3 instead of 0.8 to indicate quality
 */

// Common Portuguese topic patterns
const PORTUGUESE_TOPIC_PATTERNS: Record<
  string,
  {
    pattern: RegExp
    category: string
    topics: string[]
    confidence: number
  }
> = {
  POLITICS: {
    pattern: /\b(política|político|eleição|voto|deputado|senador|câmara|congresso|governo|legislação|lei|decreto|ministério|secretaria|prefeito|governador|presidente|candidat|campanha|partido|coligação)\b/gi,
    category: 'política',
    topics: ['política', 'legislação', 'governo', 'eleições'],
    confidence: 0.35,
  },
  ECONOMY: {
    pattern: /\b(economia|econômico|economia|mercado|bolsa|ação|dólar|real|inflação|juros|taxa|crédito|banco|empréstimo|investimento|financeiro|recessão|crescimento|pib|negócio|empresa|lucro|prejuízo|faturamento|receita|custo|preço)\b/gi,
    category: 'economia',
    topics: ['economia', 'mercado', 'investimentos', 'inflação'],
    confidence: 0.35,
  },
  HEALTH: {
    pattern: /\b(saúde|médico|medicina|hospital|doença|paciente|vírus|vacina|pandemia|epidemia|tratamento|medicamento|farmácia|clínica|cirurgia|infecção|covid|coronavírus|enfermeira|enfermeiro|diagnóstico)\b/gi,
    category: 'saúde',
    topics: ['saúde', 'medicina', 'doença', 'epidemiologia'],
    confidence: 0.35,
  },
  TECHNOLOGY: {
    pattern: /\b(tecnologia|tech|software|aplicativo|app|internet|digital|computador|celular|smartphone|iphone|android|algoritmo|inteligência artificial|ia|machine learning|blockchain|criptografia|sistema|código|programação|dados|cloud)\b/gi,
    category: 'tecnologia',
    topics: ['tecnologia', 'software', 'internet', 'inovação'],
    confidence: 0.35,
  },
  SPORTS: {
    pattern: /\b(esporte|futebol|jogador|time|campeonato|copa|liga|vitória|derrota|gol|bola|técnico|goleiro|defensa|ataque|jogo|partida|atleta|competição|medal|olimp|atleta)\b/gi,
    category: 'esportes',
    topics: ['esportes', 'futebol', 'competição', 'atleta'],
    confidence: 0.35,
  },
  CRIME: {
    pattern: /\b(crime|roubo|furto|assassinato|homicídio|polícia|delegado|preso|prisão|cadeia|presídio|justiça|tribunal|juiz|advogado|condenado|acusado|acusação|sentença|julgamento|crime organizado)\b/gi,
    category: 'polícia',
    topics: ['crime', 'justiça', 'polícia', 'segurança'],
    confidence: 0.35,
  },
  ENVIRONMENT: {
    pattern: /\b(ambiente|ambiental|ecologia|ecológico|natureza|sustentável|sustentabilidade|floresta|mata|desmatamento|queimada|aquecimento global|clima|poluição|lixo|reciclagem|energia renovável|solar|eólica)\b/gi,
    category: 'ambiente',
    topics: ['ambiente', 'ecologia', 'sustentabilidade', 'clima'],
    confidence: 0.35,
  },
}

/**
 * Fallback extraction using rule-based patterns and cache
 */
export async function fallbackExtractTopics(
  supabase: AppSupabaseClient,
  title: string,
  description: string | null | undefined,
  useCache: boolean = true
): Promise<ExtractedTopics & { source: 'fallback_cache' | 'fallback_rules' }> {
  const content = `${title}\n${description || ''}`

  // Try cache first
  if (useCache) {
    const cached = await getCachedExtraction(supabase, title, description)
    if (cached) {
      return {
        ...cached,
        source: 'fallback_cache',
      }
    }
  }

  // Rule-based extraction
  const extracted = ruleBasedExtraction(content)

  // Save to fallback cache for future use
  await saveFallbackCache(supabase, title, description, extracted)

  return {
    ...extracted,
    source: 'fallback_rules',
  }
}

/**
 * Try to find cached extraction for similar news
 * Uses full-text search on cached extractions
 */
async function getCachedExtraction(
  supabase: AppSupabaseClient,
  title: string,
  description: string | null | undefined
): Promise<ExtractedTopics | null> {
  try {
    const searchContent = `${title} ${description || ''}`

    // Search for similar titles/descriptions in fallback_extraction_cache
    const { data, error } = await supabase
      .schema('noticias')
      .from('fallback_extraction_cache')
      .select('extracted_data')
      .textSearch('search_content', searchContent) // Requires tsvector column
      .eq('status', 'active')
      .order('similarity_score', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      return null
    }

    return data.extracted_data as ExtractedTopics
  } catch (error) {
    console.warn('[FallbackExtraction] Cache lookup failed:', error)
    return null
  }
}

/**
 * Save extraction to fallback cache
 */
async function saveFallbackCache(
  supabase: AppSupabaseClient,
  title: string,
  description: string | null | undefined,
  extracted: ExtractedTopics
): Promise<void> {
  try {
    await supabase.schema('noticias').from('fallback_extraction_cache').insert({
      title,
      description,
      extracted_data: extracted,
      status: 'active',
      created_at: new Date().toISOString(),
      // search_content will be populated by database trigger for full-text search
    })
  } catch (error) {
    console.warn('[FallbackExtraction] Failed to save cache:', error)
    // Not critical - continue even if cache save fails
  }
}

/**
 * Rule-based extraction using regex patterns
 * Returns degraded confidence (0.3) to indicate lower quality
 */
function ruleBasedExtraction(content: string): ExtractedTopics {
  const topics: ExtractedTopics['topics'] = []
  const matchedCategories = new Set<string>()
  const matchedPatterns = new Set<string>()

  // Check each pattern category
  for (const [patternName, patternData] of Object.entries(PORTUGUESE_TOPIC_PATTERNS)) {
    if (patternData.pattern.test(content)) {
      matchedPatterns.add(patternName)
      matchedCategories.add(patternData.category)

      // Add topics from this category
      for (const topic of patternData.topics) {
        topics.push({
          name: topic,
          confidence: patternData.confidence, // Degraded: 0.35 instead of 0.8+
          category: patternData.category,
        })
      }
    }
  }

  // Determine primary category
  let primaryCategory = 'outros'
  if (matchedCategories.size === 1) {
    primaryCategory = Array.from(matchedCategories)[0]
  } else if (matchedCategories.size > 1) {
    // Use most common category from topics
    const categoryCount = new Map<string, number>()
    for (const topic of topics) {
      if (topic.category) {
        categoryCount.set(topic.category, (categoryCount.get(topic.category) || 0) + 1)
      }
    }
    primaryCategory = Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'outros'
  }

  // Simple sentiment analysis
  const sentiment = extractSentimentFromRules(content)

  // Extract entities (basic: proper nouns)
  const entities = extractEntitiesFromRules(content)

  return {
    topics: topics.slice(0, 5), // Max 5 topics
    entities,
    sentiment,
    category: primaryCategory,
  }
}

/**
 * Simple rule-based sentiment analysis
 * Note: This is basic - proper sentiment analysis requires more sophisticated NLP
 */
function extractSentimentFromRules(content: string): 'positive' | 'neutral' | 'negative' {
  const lowerContent = content.toLowerCase()

  // Positive indicators
  const positivePatterns = [
    /\b(crescimento|aumento|lucro|ganho|vitória|sucesso|progresso|melhoria|otim|recoverage|recuperação|boa|excelente|incrível|fantástico)\b/g,
    /\b(inovação|novo|criação|criativo|tendência|potencial)\b/g,
  ]

  // Negative indicators
  const negativePatterns = [
    /\b(queda|redução|perda|crise|problema|dificuldade|fracasso|morte|acidente|desastre|pior|ruim|péssimo|horrível)\b/g,
    /\b(alerta|aviso|risco|ameaça|ameaçado|preocupante|preocupação|conflito|tensão|disputa)\b/g,
  ]

  let positiveScore = 0
  let negativeScore = 0

  for (const pattern of positivePatterns) {
    const matches = lowerContent.match(pattern)
    positiveScore += matches ? matches.length : 0
  }

  for (const pattern of negativePatterns) {
    const matches = lowerContent.match(pattern)
    negativeScore += matches ? matches.length : 0
  }

  if (positiveScore > negativeScore) {
    return 'positive'
  } else if (negativeScore > positiveScore) {
    return 'negative'
  } else {
    return 'neutral'
  }
}

/**
 * Extract entities (basic implementation - proper noun detection)
 * A production system would use actual NER
 */
function extractEntitiesFromRules(content: string): ExtractedTopics['entities'] {
  const entities: ExtractedTopics['entities'] = []

  // Very basic: words that start with capital letters (likely proper nouns)
  const capitalized = content.match(/\b[A-Z][a-záàâãéèêíïóôõöúç]+\b/g) || []

  const uniqueCapitalized = new Set(capitalized)
  for (const word of uniqueCapitalized) {
    if (word.length > 2 && !isCommonWord(word)) {
      entities.push({
        name: word,
        type: guessEntityType(word),
      })
    }
  }

  return entities.slice(0, 10) // Max 10 entities
}

/**
 * Guess entity type based on common patterns
 * In production, use actual NER model
 */
function guessEntityType(
  word: string
): 'PERSON' | 'ORG' | 'LOCATION' | 'OTHER' {
  const lowerWord = word.toLowerCase()

  // Location suffixes/patterns
  if (/(ão|bra|il|país|cidade|estado|região|são|rio|vale|serra)$/i.test(word)) {
    return 'LOCATION'
  }

  // Organization indicators
  if (/(ltda|sa|inc|corp|grupo|banco|empresa|ministério|governo|universidade|hospital)$/i.test(word)) {
    return 'ORG'
  }

  return 'OTHER'
}

/**
 * Filter out common Portuguese words that shouldn't be marked as entities
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'O',
    'A',
    'Um',
    'Uma',
    'E',
    'Ou',
    'Mas',
    'De',
    'Da',
    'Do',
    'Para',
    'Por',
    'Em',
    'No',
    'Na',
    'Os',
    'As',
    'Uns',
    'Umas',
    'Este',
    'Esse',
    'Aquele',
    'Qual',
    'Quanto',
    'Quem',
    'Onde',
  ])

  return commonWords.has(word)
}

/**
 * Get fallback cache statistics for monitoring
 */
export async function getFallbackCacheStats(
  supabase: AppSupabaseClient
): Promise<{
  totalCached: number
  activeCached: number
  lastUpdated: Date | null
  topCategories: Array<{ category: string; count: number }>
}> {
  try {
    const { data, error } = await supabase
      .schema('noticias')
      .from('fallback_extraction_cache')
      .select(
        `
        id,
        extracted_data,
        created_at
      `
      )
      .eq('status', 'active')

    if (error || !data) {
      return {
        totalCached: 0,
        activeCached: 0,
        lastUpdated: null,
        topCategories: [],
      }
    }

    const categoryCount = new Map<string, number>()
    for (const item of data) {
      const extracted = item.extracted_data as any
      if (extracted?.category) {
        categoryCount.set(extracted.category, (categoryCount.get(extracted.category) || 0) + 1)
      }
    }

    const topCategories = Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      totalCached: data.length,
      activeCached: data.length,
      lastUpdated: data.length > 0 ? new Date(data[data.length - 1].created_at) : null,
      topCategories,
    }
  } catch (error) {
    console.error('[FallbackExtraction] Error getting cache stats:', error)
    return {
      totalCached: 0,
      activeCached: 0,
      lastUpdated: null,
      topCategories: [],
    }
  }
}
