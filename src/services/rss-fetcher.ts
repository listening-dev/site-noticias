import Parser from 'rss-parser'
import { Source } from '@/lib/types/database'
import { getCategoryResolver } from './category-resolver'

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Central-Noticias-Bot/1.0' },
})

const categoryResolver = getCategoryResolver()

export interface ParsedNewsItem {
  title: string
  description: string | null
  url: string
  source_id: string
  category: string | null
  published_at: string | null
}

export type SourceOutcome =
  | { status: 'ok';    source: Source; items: ParsedNewsItem[] }
  | { status: 'empty'; source: Source }
  | { status: 'error'; source: Source; stage: 'fetch' | 'parse'; message: string }

type FetchFn = typeof globalThis.fetch

export function createRssIngestionPipeline(deps?: { fetch?: FetchFn }) {
  const fetchFn = deps?.fetch ?? globalThis.fetch

  async function ingestFeed(source: Source): Promise<SourceOutcome> {
    let xmlContent: string
    try {
      xmlContent = await fetchWithEncodingDetection(source.rss_url, fetchFn)
    } catch (error) {
      return {
        status: 'error',
        source,
        stage: 'fetch',
        message: error instanceof Error ? error.message : String(error),
      }
    }

    let items: ParsedNewsItem[]
    try {
      const feed = await parser.parseString(xmlContent)
      items = feed.items
        .map((item) => {
          const { category } = categoryResolver.resolve(item.categories, source.category)
          return {
            title: stripHtml(item.title || '').trim(),
            description: item.contentSnippet
              ? stripHtml(item.contentSnippet).trim().slice(0, 1000)
              : item.summary
              ? stripHtml(item.summary).trim().slice(0, 1000)
              : null,
            url: item.link || item.guid || '',
            source_id: source.id,
            category,
            published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          }
        })
        .filter((item) => item.url && item.title)
    } catch (error) {
      return {
        status: 'error',
        source,
        stage: 'parse',
        message: error instanceof Error ? error.message : String(error),
      }
    }

    if (items.length === 0) {
      return { status: 'empty', source }
    }

    return { status: 'ok', source, items }
  }

  async function ingestAll(sources: Source[]): Promise<SourceOutcome[]> {
    const results = await Promise.allSettled(sources.map(ingestFeed))
    return results.map((result, i) => {
      if (result.status === 'fulfilled') return result.value
      return {
        status: 'error' as const,
        source: sources[i],
        stage: 'fetch' as const,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }
    })
  }

  return { ingestFeed, ingestAll }
}

/**
 * Busca a URL e detecta o encoding a partir da declaração XML ou header Content-Type.
 * Decodifica corretamente feeds ISO-8859-1 / Windows-1252 (comum em portais brasileiros antigos).
 */
async function fetchWithEncodingDetection(url: string, fetchFn: FetchFn): Promise<string> {
  const response = await fetchFn(url, {
    headers: { 'User-Agent': 'Central-Noticias-Bot/1.0' },
    signal: AbortSignal.timeout(10000),
  })

  const buffer = await response.arrayBuffer()
  const uint8Array = new Uint8Array(buffer)

  // 1. Tentar detectar encoding na declaração XML (<?xml encoding="..."?>)
  const firstBytes = new TextDecoder('ascii', { fatal: false }).decode(uint8Array.slice(0, 200))
  const xmlMatch = firstBytes.match(/encoding=["']([^"']+)["']/i)

  // 2. Tentar detectar via header Content-Type: charset=...
  const contentType = response.headers.get('content-type') || ''
  const ctMatch = contentType.match(/charset=([^\s;]+)/i)

  const encoding = (xmlMatch?.[1] || ctMatch?.[1] || 'utf-8').toLowerCase()

  if (['iso-8859-1', 'iso8859-1', 'windows-1252', 'latin1', 'latin-1', 'cp1252'].includes(encoding)) {
    return new TextDecoder('windows-1252').decode(uint8Array)
  }

  return new TextDecoder('utf-8').decode(uint8Array)
}


function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    // Entidades HTML nomeadas
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    // Entidades HTML numéricas decimais (ex: &#233; = é)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    // Entidades HTML numéricas hexadecimais (ex: &#xE9; = é)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    // Remover símbolos geométricos/especiais que surgem como artefatos de encoding
    .replace(/[►◄▼▲◆◇●○■□★☆✓→←↑↓◮◭]/g, '')
    // Normalizar espaços
    .replace(/\s+/g, ' ')
    .trim()
}
