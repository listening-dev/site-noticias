/**
 * Converte uma query booleana simples em formato tsquery do PostgreSQL.
 *
 * Suporta operadores: AND, OR, NOT (maiúsculas ou minúsculas)
 * Suporta aspas duplas para frases exatas.
 *
 * Exemplos:
 *   "ministério AND transportes"        → "ministério & transportes"
 *   "governo OR presidente"             → "governo | presidente"
 *   "lula NOT bolsonaro"                → "lula & !bolsonaro"
 *   "\"reforma tributária\" AND imposto" → "'reforma tributária' & imposto"
 */
export function booleanQueryToTsquery(query: string): string {
  if (!query.trim()) return ''

  let result = query.trim()

  // Substituir frases entre aspas por tokens sem espaço (processados depois)
  const phrases: string[] = []
  result = result.replace(/"([^"]+)"/g, (_, phrase) => {
    const idx = phrases.length
    phrases.push(phrase.trim().replace(/\s+/g, ' & '))
    return `__PHRASE_${idx}__`
  })

  // Substituir operadores booleanos
  result = result
    .replace(/\bAND\b/gi, '&')
    .replace(/\bOR\b/gi, '|')
    .replace(/\bNOT\b/gi, '& !')

  // Restaurar frases
  phrases.forEach((phrase, idx) => {
    result = result.replace(`__PHRASE_${idx}__`, `(${phrase})`)
  })

  // Limpar espaços redundantes
  result = result.replace(/\s+/g, ' ').trim()

  // Termos soltos (sem operador entre eles) → AND implícito
  result = result.replace(/([a-záàâãéèêíïóôõöúçñü\w]+)\s+([a-záàâãéèêíïóôõöúçñü\w(])/gi, '$1 & $2')

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
 * Extrai os termos de busca de uma query booleana (para highlight)
 */
export function extractKeywords(query: string): string[] {
  return query
    .replace(/\b(AND|OR|NOT)\b/gi, ' ')
    .replace(/[&|!()]/g, ' ')
    .replace(/"/g, '')
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 2)
}
