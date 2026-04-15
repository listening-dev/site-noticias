/**
 * Converte uma query booleana em formato tsquery do PostgreSQL.
 *
 * Suporta operadores: AND, OR, NOT (maiúsculas ou minúsculas)
 * Suporta aspas duplas para frases exatas (usa <-> para proximidade).
 *
 * Gera output compatível com to_tsquery('portuguese', ...):
 *   cada lexema é envolvido em aspas simples.
 *
 * Exemplos:
 *   "ministério AND transportes"             → "'ministério' & 'transportes'"
 *   "governo OR presidente"                  → "'governo' | 'presidente'"
 *   "\"reforma tributária\" AND imposto"      → "('reforma' <-> 'tributária') & 'imposto'"
 */
export function booleanQueryToTsquery(query: string): string {
  if (!query.trim()) return ''

  let result = query.trim()

  // 1. Extrair frases entre aspas e substituir por placeholders
  const phrases: string[] = []
  result = result.replace(/"([^"]+)"/g, (_, phrase) => {
    const idx = phrases.length
    // Cada palavra da frase entre aspas simples, unidas por <->
    const words = phrase.trim().split(/\s+/).map((w: string) => `'${w}'`).join(' <-> ')
    phrases.push(words)
    return `__PHRASE_${idx}__`
  })

  // 2. Substituir operadores booleanos
  result = result
    .replace(/\bAND\b/gi, '&')
    .replace(/\bOR\b/gi, '|')
    .replace(/\bNOT\b/gi, '& !')

  // 3. Restaurar frases
  phrases.forEach((phrase, idx) => {
    result = result.replace(`__PHRASE_${idx}__`, `(${phrase})`)
  })

  // 4. Envolver termos soltos em aspas simples
  // Termos soltos são palavras que não estão entre aspas simples, não são operadores, e não são parênteses
  result = result.replace(/(?<=[')\s&|!]|^)\s*([a-záàâãéèêíïóôõöúçñüA-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑÜ\w*]+)\s*(?=[&|!)\s]|$)/g, (match, word) => {
    const trimmed = word.trim()
    if (!trimmed) return match
    return match.replace(trimmed, `'${trimmed}'`)
  })

  // 5. Limpar espaços redundantes
  result = result.replace(/\s+/g, ' ').trim()

  // 6. Inserir & implícito entre termos adjacentes sem operador
  result = result.replace(/'(\s+)'/g, "' & '")

  return result
}

/**
 * Valida se a query booleana é utilizável
 */
export function isValidBooleanQuery(query: string): boolean {
  try {
    const converted = booleanQueryToTsquery(query)
    return converted.length > 0
  } catch {
    return false
  }
}

/**
 * Extrai os termos de busca de uma query booleana (para highlight).
 * Frases entre aspas são extraídas inteiras. Termos soltos são extraídos individualmente.
 */
export function extractKeywords(query: string): string[] {
  const keywords: string[] = []

  // Extrair frases entre aspas (inteiras)
  const phraseRegex = /"([^"]+)"/g
  let match
  while ((match = phraseRegex.exec(query)) !== null) {
    const phrase = match[1].trim()
    if (phrase.length > 2) keywords.push(phrase.toLowerCase())
  }

  // Extrair termos soltos (fora de aspas)
  const withoutPhrases = query.replace(/"[^"]+"/g, ' ')
  const terms = withoutPhrases
    .replace(/\b(AND|OR|NOT)\b/gi, ' ')
    .replace(/[&|!()]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 2)

  keywords.push(...terms)
  return [...new Set(keywords)]
}
