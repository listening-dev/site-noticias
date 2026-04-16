/**
 * tsquery Validation & Sanitization Utilities
 *
 * Prevents invalid PostgreSQL full-text queries from crashing matching jobs.
 * Provides fallback mechanisms for graceful degradation.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/types/database'

type AppSupabaseClient = SupabaseClient<Database>

/**
 * Validates if a tsquery string is valid PostgreSQL syntax.
 *
 * @param tsquery - Raw tsquery string (e.g., "'word1' & 'word2'")
 * @param supabase - Supabase client (used to call validate_tsquery RPC)
 * @returns true if valid, false otherwise
 *
 * @example
 * const valid = await isValidTsquery("'inflação' & 'imposto'", supabase)
 * // true
 *
 * const invalid = await isValidTsquery("'inflação' &", supabase)
 * // false (incomplete operator)
 */
export async function isValidTsquery(
  tsquery: string,
  supabase: AppSupabaseClient
): Promise<boolean> {
  if (!tsquery || tsquery.trim().length === 0) {
    return false
  }

  try {
    const { data, error } = await supabase
      .schema('noticias')
      .rpc('validate_tsquery', { tsquery_text: tsquery })

    if (error) {
      console.warn('[tsquery] Validation RPC failed:', error.message)
      return false
    }

    return data === true
  } catch (error) {
    console.warn('[tsquery] Validation error:', error)
    return false
  }
}

/**
 * Extracts keywords from a tsquery string for fallback simple AND query.
 *
 * @param tsquery - Raw tsquery string
 * @returns Array of keywords (max 10)
 *
 * @example
 * const keywords = extractTsqueryKeywords("'inflação' & 'imposto'")
 * // ["inflação", "imposto"]
 *
 * const keywords = extractTsqueryKeywords("'reforma tributária' OR banco")
 * // ["reforma", "tributária", "banco"]
 */
export function extractTsqueryKeywords(tsquery: string): string[] {
  if (!tsquery || tsquery.trim().length === 0) {
    return []
  }

  // Remove operators, parentheses, and quotes
  const cleaned = tsquery
    .replace(/[&|!()]/g, ' ') // Remove boolean operators
    .replace(/'([^']*)'/g, '$1') // Remove single quotes but keep content
    .replace(/"/g, '') // Remove double quotes
    .replace(/[<>-]/g, ' ') // Remove proximity operators

  // Split by whitespace, filter empty strings
  const keywords = cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2) // Min length 3

  // Deduplicate and limit to 10
  return [...new Set(keywords)].slice(0, 10)
}

/**
 * Sanitizes a tsquery by removing dangerous syntax.
 * IMPORTANT: This is NOT a full validator—use isValidTsquery() for that.
 *
 * This function removes incomplete operators and balances parentheses.
 *
 * @param tsquery - Raw tsquery string
 * @returns Sanitized tsquery string
 *
 * @example
 * const safe = sanitizeTsquery("'word1' &")
 * // "'word1'" (trailing operator removed)
 *
 * const safe = sanitizeTsquery("'word1' & 'word2' )")
 * // "'word1' & 'word2'" (unbalanced paren removed)
 */
export function sanitizeTsquery(tsquery: string): string {
  if (!tsquery || tsquery.trim().length === 0) {
    return ''
  }

  let result = tsquery.trim()

  // Remove trailing operators
  result = result.replace(/[&|!]\s*$/, '')

  // Balance parentheses
  let openCount = (result.match(/\(/g) || []).length
  let closeCount = (result.match(/\)/g) || []).length

  if (closeCount > openCount) {
    // Remove excess closing parens
    const excess = closeCount - openCount
    for (let i = 0; i < excess; i++) {
      result = result.replace(/\)(?!.*\()/, '') // Remove rightmost unmatched )
    }
  } else if (openCount > closeCount) {
    // Add missing closing parens
    const missing = openCount - closeCount
    result += ')'.repeat(missing)
  }

  return result.trim()
}

/**
 * Safe tsquery matching: validate first, fallback to simple keyword search.
 *
 * WORKFLOW:
 * 1. Try to validate the tsquery
 * 2. If valid, return as-is
 * 3. If invalid, extract keywords and build simple AND query
 * 4. If no keywords extracted, return empty string (will match 0 rows)
 *
 * @param tsquery - Raw tsquery string
 * @param supabase - Supabase client
 * @param options - Control fallback behavior
 * @returns Safe, validated tsquery string (or empty if no valid query)
 *
 * @example
 * // Valid tsquery → returned as-is
 * const safe = await safeTsquery("'inflação' & 'imposto'", supabase)
 * // "'inflação' & 'imposto'"
 *
 * // Invalid tsquery → fallback to keywords
 * const safe = await safeTsquery("'inflação' &", supabase)
 * // "'inflação'" (trailing & removed)
 *
 * // No valid query → empty string
 * const safe = await safeTsquery("&&&", supabase)
 * // ""
 */
export async function safeTsquery(
  tsquery: string,
  supabase: AppSupabaseClient,
  options?: {
    enableFallback?: boolean // Default: true
    maxKeywords?: number // Default: 10
  }
): Promise<string> {
  const { enableFallback = true, maxKeywords = 10 } = options || {}

  if (!tsquery || tsquery.trim().length === 0) {
    return ''
  }

  // Try to validate
  const isValid = await isValidTsquery(tsquery, supabase)
  if (isValid) {
    return tsquery
  }

  if (!enableFallback) {
    return '' // Return empty if validation fails and no fallback
  }

  // Fallback: extract keywords and build simple AND query
  const keywords = extractTsqueryKeywords(tsquery).slice(0, maxKeywords)

  if (keywords.length === 0) {
    return ''
  }

  // Build simple AND query: 'word1' & 'word2' & ...
  return keywords.map((k) => `'${k}'`).join(' & ')
}

/**
 * Converts a fallible user query into a safe tsquery using multiple strategies.
 *
 * STRATEGIES (in order):
 * 1. If user input looks like tsquery (has quotes/operators), validate it
 * 2. If validation fails, extract keywords and rebuild
 * 3. If no keywords, try naive word-splitting with AND
 * 4. If all fails, return empty string
 *
 * @param userQuery - User input (may be a boolean query or free text)
 * @param supabase - Supabase client
 * @returns Validated tsquery string or empty if no valid query
 *
 * @example
 * // Looks like boolean query → validate & use
 * const tsq = await userQueryToSafeTsquery("inflação AND imposto", supabase)
 * // "'inflação' & 'imposto'" (after conversion by booleanQueryToTsquery)
 *
 * // Invalid boolean → fallback to keywords
 * const tsq = await userQueryToSafeTsquery("inflação &", supabase)
 * // "'inflação'" (& removed)
 *
 * // Free text → word split
 * const tsq = await userQueryToSafeTsquery("reforma tributária", supabase)
 * // "'reforma' & 'tributária'"
 */
export async function userQueryToSafeTsquery(
  userQuery: string,
  supabase: AppSupabaseClient,
  booleanConverter?: (q: string) => string
): Promise<string> {
  if (!userQuery || userQuery.trim().length === 0) {
    return ''
  }

  // Detect if user query looks like boolean (has operators or quotes)
  const looksLikeBoolean = /\b(AND|OR|NOT)\b/i.test(userQuery) || /["&|!()]/.test(userQuery)

  let tsquery: string

  if (looksLikeBoolean && booleanConverter) {
    // Try to convert boolean query to tsquery
    tsquery = booleanConverter(userQuery)
  } else {
    // Treat as free text: simple word splitting
    const words = userQuery
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2)
      .slice(0, 10)

    if (words.length === 0) {
      return ''
    }

    tsquery = words.map((w) => `'${w}'`).join(' & ')
  }

  // Validate and fallback if needed
  return await safeTsquery(tsquery, supabase, { enableFallback: true })
}

/**
 * Logs tsquery validation failure with context for debugging.
 *
 * @param tsquery - The failed tsquery
 * @param context - Additional context (filter name, user ID, etc)
 * @param error - Original error (optional)
 */
export function logTsqueryFailure(
  tsquery: string,
  context?: { filterId?: string; userId?: string; filterName?: string },
  error?: any
): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(
    '[tsquery] Validation failed',
    {
      tsquery: tsquery.substring(0, 100), // Truncate if too long
      context,
      error: message,
      timestamp: new Date().toISOString(),
    }
  )
}
