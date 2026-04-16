/**
 * Itera uma query do Supabase em lotes para bypassar o cap de ~1000 rows
 * do PostgREST (db-max-rows). Retorna o array completo de rows.
 *
 * Aceita uma FACTORY function que produz uma query fresca a cada chamada,
 * porque os builders do Supabase são consumidos após await. A factory deve
 * conter todos os filtros (.eq, .gte, .select, etc.) exceto o `.range`.
 *
 * @param makeQuery factory que devolve um PostgrestFilterBuilder novo
 * @param opts.pageSize tamanho do lote (default 1000, limite real do PostgREST)
 * @param opts.maxRows limite superior de segurança (default 100000)
 * @param opts.context rótulo usado no log de erro
 * @returns todas as rows retornadas pelas páginas até fim dos dados
 *
 * @example
 *   const topics = await paginateRows<{ topic_name: string }>(
 *     () => supabase.schema('noticias').from('topic_mentions')
 *             .select('topic_name')
 *             .gte('mentioned_at', since),
 *     { context: 'TrendingTopics' }
 *   )
 */
export async function paginateRows<T>(
  makeQuery: () => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
  },
  opts: { pageSize?: number; maxRows?: number; context?: string } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 1000
  const maxRows = opts.maxRows ?? 100000
  const context = opts.context ?? 'paginate'
  const all: T[] = []

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await makeQuery().range(offset, offset + pageSize - 1)

    if (error) {
      const e = error as {
        message?: string
        code?: string
        details?: string
        hint?: string
      }
      console.error(`[${context}] Pagination error at offset ${offset}:`, {
        message: e?.message,
        code: e?.code,
        details: e?.details,
        hint: e?.hint,
      })
      return all
    }

    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
  }

  return all
}
