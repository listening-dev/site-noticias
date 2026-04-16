/**
 * Category Resolver Service
 *
 * Resolves RSS item categories to system categories with visibility into:
 * - Which resolution strategy was used (item-exact, item-partial, source, fallback)
 * - Which categories don't match (for monitoring)
 * - Metrics for category mapping quality
 */

export type SystemCategory =
  | 'politica'
  | 'economia'
  | 'saude'
  | 'educacao'
  | 'seguranca'
  | 'agricultura'
  | 'energia'
  | 'infraestrutura'
  | 'internacional'
  | 'regional'
  | 'geral'

export interface ResolutionMetrics {
  /** Qual estratégia foi usada */
  strategy: 'item-exact' | 'item-partial' | 'source' | 'fallback'
  /** Categoria original do item RSS */
  itemCategories: string[]
  /** Categoria da fonte */
  sourceCategory: string | null
  /** Resultado final */
  resolvedCategory: SystemCategory
  /** Se a resolução foi um fallback (perda de sinal) */
  isFallback: boolean
}

/**
 * CategoryResolver: Resolvido categorias RSS para sistema com telemetria
 */
export class CategoryResolver {
  private categoryMap: Record<string, SystemCategory> = {
    política: 'politica',
    politica: 'politica',
    governo: 'politica',
    parlamento: 'politica',
    eleição: 'politica',
    eleicao: 'politica',

    economia: 'economia',
    economía: 'economia',
    negócios: 'economia',
    negocios: 'economia',
    bolsa: 'economia',
    mercado: 'economia',
    finanças: 'economia',
    financas: 'economia',
    banco: 'economia',

    saúde: 'saude',
    saude: 'saude',
    medicina: 'saude',
    médico: 'saude',
    medico: 'saude',
    hospital: 'saude',
    covid: 'saude',
    pandemia: 'saude',

    educação: 'educacao',
    educacao: 'educacao',
    escola: 'educacao',
    universidade: 'educacao',
    ensino: 'educacao',
    professor: 'educacao',
    aluno: 'educacao',

    segurança: 'seguranca',
    seguranca: 'seguranca',
    polícia: 'seguranca',
    policia: 'seguranca',
    crime: 'seguranca',
    justiça: 'seguranca',
    justica: 'seguranca',
    tribunal: 'seguranca',

    agricultura: 'agricultura',
    agrícola: 'agricultura',
    agricola: 'agricultura',
    fazenda: 'agricultura',
    lavoura: 'agricultura',
    agropecuária: 'agricultura',
    agropecuaria: 'agricultura',
    pecuária: 'agricultura',
    pecuaria: 'agricultura',

    energia: 'energia',
    petróleo: 'energia',
    petroleo: 'energia',
    gás: 'energia',
    gas: 'energia',
    eletricidade: 'energia',
    usina: 'energia',

    infraestrutura: 'infraestrutura',
    transporte: 'infraestrutura',
    rodovia: 'infraestrutura',
    ferrovia: 'infraestrutura',
    aeroporto: 'infraestrutura',
    porto: 'infraestrutura',
    construção: 'infraestrutura',
    construcao: 'infraestrutura',

    internacional: 'internacional',
    mundo: 'internacional',
    exterior: 'internacional',
    global: 'internacional',
    diplomacia: 'internacional',

    regional: 'regional',
    estado: 'regional',
    município: 'regional',
    municipio: 'regional',
    cidade: 'regional',
    local: 'regional',
  }

  /** Track resolution metrics for monitoring */
  private metrics: ResolutionMetrics[] = []

  /**
   * Resolve categoria de um item RSS
   *
   * Estratégia:
   * 1. Match exato na categoria do item (ex: "Economia" → "economia")
   * 2. Match parcial (ex: "Economia & Negócios" contém "economia")
   * 3. Usar categoria da fonte (se não for "tecnologia")
   * 4. Fallback para "geral" (com aviso)
   *
   * @param itemCategories - Categorias do item RSS
   * @param sourceCategory - Categoria padrão da fonte
   * @returns Categoria do sistema + métricas
   *
   * @example
   * const { category, metrics } = resolver.resolve(
   *   ['Economia', 'Negócios'],
   *   'economia'
   * )
   * // category: 'economia'
   * // metrics.strategy: 'item-exact'
   */
  resolve(
    itemCategories: string[] | undefined,
    sourceCategory: string | null
  ): { category: SystemCategory; metrics: ResolutionMetrics } {
    // Strategy 1: Item exact match
    if (itemCategories && itemCategories.length > 0) {
      for (const cat of itemCategories) {
        const lower = cat.toLowerCase().trim()
        if (this.categoryMap[lower]) {
          const resolved = this.categoryMap[lower]
          const metrics = {
            strategy: 'item-exact' as const,
            itemCategories,
            sourceCategory,
            resolvedCategory: resolved,
            isFallback: false,
          }
          this.metrics.push(metrics)
          return { category: resolved, metrics }
        }
      }

      // Strategy 2: Item partial match
      for (const cat of itemCategories) {
        const lower = cat.toLowerCase().trim()
        for (const [key, value] of Object.entries(this.categoryMap)) {
          if (lower.includes(key)) {
            const metrics = {
              strategy: 'item-partial' as const,
              itemCategories,
              sourceCategory,
              resolvedCategory: value,
              isFallback: false,
            }
            this.metrics.push(metrics)
            return { category: value, metrics }
          }
        }
      }

      // Item categories didn't match, log warning
      console.warn(`[CategoryResolver] Item categories didn't match any pattern: ${itemCategories.join(', ')}`)
    }

    // Strategy 3: Source category (skip if "tecnologia")
    if (sourceCategory && sourceCategory !== 'tecnologia') {
      const sourceLower = sourceCategory.toLowerCase().trim()
      if (this.categoryMap[sourceLower]) {
        const resolved = this.categoryMap[sourceLower]
        const metrics = {
          strategy: 'source' as const,
          itemCategories: itemCategories || [],
          sourceCategory,
          resolvedCategory: resolved,
          isFallback: false,
        }
        this.metrics.push(metrics)
        return { category: resolved, metrics }
      }
    }

    // Strategy 4: Fallback (signal loss)
    const metrics = {
      strategy: 'fallback' as const,
      itemCategories: itemCategories || [],
      sourceCategory,
      resolvedCategory: 'geral' as const,
      isFallback: true,
    }
    this.metrics.push(metrics)

    if (sourceCategory === 'tecnologia') {
      console.warn(`[CategoryResolver] Source category "tecnologia" is filtered; falling back to "geral"`)
    } else if (itemCategories?.length) {
      console.warn(`[CategoryResolver] No category match for items: ${itemCategories.join(', ')}; using source="${sourceCategory}"; falling back to "geral"`)
    } else {
      console.log(`[CategoryResolver] No category provided; using fallback "geral"`)
    }

    return { category: 'geral', metrics }
  }

  /**
   * Get resolution metrics (for monitoring/telemetry)
   * Useful to track:
   * - Which strategies are most common
   * - How often fallbacks happen
   * - Which categories are problematic
   *
   * @example
   * const stats = resolver.getMetrics()
   * console.log(`Fallback rate: ${stats.fallbackCount / stats.totalResolutions * 100}%`)
   */
  getMetrics(): {
    totalResolutions: number
    fallbackCount: number
    fallbackRate: number
    strategyDistribution: Record<string, number>
    unmatchedCategories: Set<string>
  } {
    const strategyCount: Record<string, number> = {}
    let fallbackCount = 0
    const unmatchedCategories = new Set<string>()

    for (const m of this.metrics) {
      strategyCount[m.strategy] = (strategyCount[m.strategy] ?? 0) + 1
      if (m.isFallback) fallbackCount++
      if (m.strategy === 'fallback' && m.itemCategories.length > 0) {
        m.itemCategories.forEach((c) => unmatchedCategories.add(c))
      }
    }

    return {
      totalResolutions: this.metrics.length,
      fallbackCount,
      fallbackRate: this.metrics.length > 0 ? fallbackCount / this.metrics.length : 0,
      strategyDistribution: strategyCount,
      unmatchedCategories,
    }
  }

  /**
   * Reset metrics (for testing or daily rotation)
   */
  resetMetrics(): void {
    this.metrics = []
  }
}

/**
 * Singleton instance for application-wide use
 */
let instance: CategoryResolver | null = null

export function getCategoryResolver(): CategoryResolver {
  if (!instance) {
    instance = new CategoryResolver()
  }
  return instance
}

/**
 * Reset singleton (for testing)
 */
export function resetCategoryResolver(): void {
  instance = null
}
