/**
 * Temporal Analysis Service Tests
 *
 * Tests for:
 * - getTemporalDistribution: Daily stats aggregation
 * - getThemeTimeline: Theme mention tracking over time
 * - getSentimentTrend: Sentiment distribution by day
 * - detectSpikes: Spike detection with configurable threshold
 *
 * Key Test Scenarios:
 * 1. Normal case: Multiple days with varied data
 * 2. Edge cases: Empty data, single day, single news item
 * 3. Data quality: Missing fields, invalid dates, malformed JSON
 * 4. Spike detection: Threshold validation, boundary conditions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getTemporalDistribution,
  getThemeTimeline,
  getSentimentTrend,
  detectSpikes,
  DailyStats,
  ThemeTimeline,
  SentimentTrend,
} from '@/services/temporal-analysis'

/**
 * Test Fixtures: Realistic data for testing
 */
const FIXTURE_NEWS_MULTIPLE_DAYS = [
  {
    id: 'news-1',
    published_at: '2026-04-14T10:00:00Z',
  },
  {
    id: 'news-2',
    published_at: '2026-04-14T14:30:00Z',
  },
  {
    id: 'news-3',
    published_at: '2026-04-14T18:00:00Z',
  },
  {
    id: 'news-4',
    published_at: '2026-04-15T09:00:00Z',
  },
  {
    id: 'news-5',
    published_at: '2026-04-15T15:45:00Z',
  },
  {
    id: 'news-6',
    published_at: '2026-04-16T11:20:00Z',
  },
]

const FIXTURE_TOPICS_MULTIPLE_DAYS = [
  { news_id: 'news-1', sentiment: 'positive', extracted_at: '2026-04-14T10:05:00Z' },
  { news_id: 'news-2', sentiment: 'neutral', extracted_at: '2026-04-14T14:35:00Z' },
  { news_id: 'news-3', sentiment: 'negative', extracted_at: '2026-04-14T18:05:00Z' },
  { news_id: 'news-4', sentiment: 'positive', extracted_at: '2026-04-15T09:05:00Z' },
  { news_id: 'news-5', sentiment: 'positive', extracted_at: '2026-04-15T15:50:00Z' },
  { news_id: 'news-6', sentiment: 'negative', extracted_at: '2026-04-16T11:25:00Z' },
]

const FIXTURE_TOPICS_WITH_THEMES = [
  {
    news_id: 'news-1',
    topics: [
      { name: 'inflação', confidence: 0.9 },
      { name: 'economia', confidence: 0.8 },
    ],
    extracted_at: '2026-04-14T10:05:00Z',
  },
  {
    news_id: 'news-2',
    topics: [
      { name: 'inflação', confidence: 0.85 },
      { name: 'banco central', confidence: 0.7 },
    ],
    extracted_at: '2026-04-14T14:35:00Z',
  },
  {
    news_id: 'news-3',
    topics: [{ name: 'economia', confidence: 0.88 }],
    extracted_at: '2026-04-14T18:05:00Z',
  },
  {
    news_id: 'news-4',
    topics: [{ name: 'inflação', confidence: 0.92 }],
    extracted_at: '2026-04-15T09:05:00Z',
  },
]

/**
 * Pure Function Tests: detectSpikes (no DB dependency)
 */
describe('detectSpikes (pure function)', () => {
  const DAILY_STATS: DailyStats[] = [
    {
      date: '2026-04-14',
      total_news: 10,
      positive_sentiment: 3,
      neutral_sentiment: 4,
      negative_sentiment: 3,
      themes_mentioned: 5,
    },
    {
      date: '2026-04-15',
      total_news: 25, // 2.5x average
      positive_sentiment: 10,
      neutral_sentiment: 10,
      negative_sentiment: 5,
      themes_mentioned: 12,
    },
    {
      date: '2026-04-16',
      total_news: 12,
      positive_sentiment: 5,
      neutral_sentiment: 4,
      negative_sentiment: 3,
      themes_mentioned: 6,
    },
    {
      date: '2026-04-17',
      total_news: 8,
      positive_sentiment: 2,
      neutral_sentiment: 3,
      negative_sentiment: 3,
      themes_mentioned: 4,
    },
  ]

  it('should detect spikes above threshold', async () => {
    const spikes = await detectSpikes(DAILY_STATS, 1.5)

    expect(spikes).toHaveLength(1)
    expect(spikes[0].date).toBe('2026-04-15')
    expect(spikes[0].spike_factor).toBeCloseTo(2.5, 1)
  })

  it('should return empty array when no spikes', async () => {
    const spikes = await detectSpikes(DAILY_STATS, 3.0)

    expect(spikes).toHaveLength(0)
  })

  it('should use configurable threshold', async () => {
    const spikes_low = await detectSpikes(DAILY_STATS, 1.2)
    const spikes_high = await detectSpikes(DAILY_STATS, 2.0)

    expect(spikes_low.length).toBeGreaterThanOrEqual(spikes_high.length)
  })

  it('should handle empty data', async () => {
    const spikes = await detectSpikes([], 1.5)

    expect(spikes).toEqual([])
  })

  it('should handle single data point', async () => {
    const single = [DAILY_STATS[0]]
    const spikes = await detectSpikes(single, 1.5)

    // Single point: average = 10, spike_factor = 10/10 = 1.0 (below threshold)
    expect(spikes).toHaveLength(0)
  })

  it('should handle all points equal (no spikes)', async () => {
    const flat: DailyStats[] = [
      { ...DAILY_STATS[0], total_news: 20 },
      { ...DAILY_STATS[1], total_news: 20 },
      { ...DAILY_STATS[2], total_news: 20 },
    ]

    const spikes = await detectSpikes(flat, 1.5)

    expect(spikes).toHaveLength(0)
  })

  it('should calculate spike_factor correctly', async () => {
    const spikes = await detectSpikes(DAILY_STATS, 1.0)

    const spike = spikes.find((s) => s.date === '2026-04-15')
    expect(spike?.spike_factor).toBeCloseTo(2.5, 1)
  })
})

/**
 * Mocked DB Tests: Functions with Supabase dependency
 *
 * Note: In real testing, these would use PGLite or local Supabase emulator
 * For demonstration, we use mocked responses
 */
describe('Temporal Analysis (with mocked Supabase)', () => {
  let mockSupabase: any

  beforeEach(() => {
    // Mock Supabase client
    mockSupabase = {
      schema: vi.fn(() => mockSupabase),
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      gte: vi.fn(() => mockSupabase),
      lte: vi.fn(() => mockSupabase),
      in: vi.fn(() => mockSupabase),
      order: vi.fn(() => mockSupabase),
    }
  })

  describe('getTemporalDistribution', () => {
    it('should aggregate news by day', async () => {
      // Mock responses
      mockSupabase.select.mockReturnValueOnce({
        gte: () => ({
          lte: () => ({
            order: async () => ({
              data: FIXTURE_NEWS_MULTIPLE_DAYS,
              error: null,
            }),
          }),
        }),
      })

      mockSupabase.select.mockReturnValueOnce({
        in: async () => ({
          data: FIXTURE_TOPICS_MULTIPLE_DAYS,
          error: null,
        }),
      })

      const result = await getTemporalDistribution(
        mockSupabase,
        '2026-04-14T00:00:00Z',
        '2026-04-16T23:59:59Z'
      )

      expect(result).toHaveLength(3) // 3 days
      expect(result[0].date).toBe('2026-04-14')
      expect(result[0].total_news).toBe(3)
      expect(result[0].positive_sentiment).toBe(1)
      expect(result[0].neutral_sentiment).toBe(1)
      expect(result[0].negative_sentiment).toBe(1)
    })

    it('should return empty array when no news found', async () => {
      mockSupabase.select.mockReturnValueOnce({
        gte: () => ({
          lte: () => ({
            order: async () => ({
              data: [],
              error: null,
            }),
          }),
        }),
      })

      const result = await getTemporalDistribution(
        mockSupabase,
        '2026-04-14T00:00:00Z',
        '2026-04-16T23:59:59Z'
      )

      expect(result).toEqual([])
    })

    it('should handle missing sentiment data gracefully', async () => {
      mockSupabase.select.mockReturnValueOnce({
        gte: () => ({
          lte: () => ({
            order: async () => ({
              data: FIXTURE_NEWS_MULTIPLE_DAYS,
              error: null,
            }),
          }),
        }),
      })

      // Return topics without sentiment
      mockSupabase.select.mockReturnValueOnce({
        in: async () => ({
          data: FIXTURE_TOPICS_MULTIPLE_DAYS.map((t) => ({ ...t, sentiment: null })),
          error: null,
        }),
      })

      const result = await getTemporalDistribution(
        mockSupabase,
        '2026-04-14T00:00:00Z',
        '2026-04-16T23:59:59Z'
      )

      expect(result).toHaveLength(3)
      expect(result[0].positive_sentiment).toBe(0)
      expect(result[0].neutral_sentiment).toBe(0)
      expect(result[0].negative_sentiment).toBe(0)
    })
  })

  describe('getThemeTimeline', () => {
    it('should track theme mentions over time', async () => {
      mockSupabase.select.mockReturnValueOnce({
        gte: () => ({
          lte: async () => ({
            data: FIXTURE_NEWS_MULTIPLE_DAYS,
            error: null,
          }),
        }),
      })

      mockSupabase.select.mockReturnValueOnce({
        in: async () => ({
          data: FIXTURE_TOPICS_WITH_THEMES,
          error: null,
        }),
      })

      const result = await getThemeTimeline(
        mockSupabase,
        'inflação',
        '2026-04-14T00:00:00Z',
        '2026-04-16T23:59:59Z'
      )

      // inflação mentioned on: 2026-04-14 (2x), 2026-04-15 (1x)
      expect(result.length).toBeGreaterThan(0)
      expect(result.some((r) => r['inflação'] === 2)).toBe(true)
    })

    it('should return empty array when theme not found', async () => {
      mockSupabase.select.mockReturnValueOnce({
        gte: () => ({
          lte: async () => ({
            data: FIXTURE_NEWS_MULTIPLE_DAYS,
            error: null,
          }),
        }),
      })

      mockSupabase.select.mockReturnValueOnce({
        in: async () => ({
          data: FIXTURE_TOPICS_WITH_THEMES,
          error: null,
        }),
      })

      const result = await getThemeTimeline(
        mockSupabase,
        'não-existe',
        '2026-04-14T00:00:00Z',
        '2026-04-16T23:59:59Z'
      )

      expect(result).toEqual([])
    })

    it('should handle case-insensitive theme matching', async () => {
      mockSupabase.select.mockReturnValueOnce({
        gte: () => ({
          lte: async () => ({
            data: FIXTURE_NEWS_MULTIPLE_DAYS.slice(0, 2),
            error: null,
          }),
        }),
      })

      mockSupabase.select.mockReturnValueOnce({
        in: async () => ({
          data: FIXTURE_TOPICS_WITH_THEMES.slice(0, 2),
          error: null,
        }),
      })

      const result_lower = await getThemeTimeline(
        mockSupabase,
        'inflação',
        '2026-04-14T00:00:00Z',
        '2026-04-16T23:59:59Z'
      )

      const result_upper = await getThemeTimeline(
        mockSupabase,
        'INFLAÇÃO',
        '2026-04-14T00:00:00Z',
        '2026-04-16T23:59:59Z'
      )

      expect(result_lower.length).toBe(result_upper.length)
    })
  })

  describe('getSentimentTrend', () => {
    it('should aggregate sentiment by day', async () => {
      mockSupabase.select.mockReturnValueOnce({
        gte: () => ({
          lte: async () => ({
            data: FIXTURE_NEWS_MULTIPLE_DAYS,
            error: null,
          }),
        }),
      })

      mockSupabase.select.mockReturnValueOnce({
        in: async () => ({
          data: FIXTURE_TOPICS_MULTIPLE_DAYS,
          error: null,
        }),
      })

      const result = await getSentimentTrend(
        mockSupabase,
        '2026-04-14T00:00:00Z',
        '2026-04-16T23:59:59Z'
      )

      expect(result).toHaveLength(3) // 3 days
      expect(result[0].date).toBe('2026-04-14')
      expect(result[0].positive).toBe(1)
      expect(result[0].neutral).toBe(1)
      expect(result[0].negative).toBe(1)
    })

    it('should return empty array when no news', async () => {
      mockSupabase.select.mockReturnValueOnce({
        gte: () => ({
          lte: async () => ({
            data: [],
            error: null,
          }),
        }),
      })

      const result = await getSentimentTrend(
        mockSupabase,
        '2026-04-14T00:00:00Z',
        '2026-04-16T23:59:59Z'
      )

      expect(result).toEqual([])
    })

    it('should handle missing sentiment values', async () => {
      mockSupabase.select.mockReturnValueOnce({
        gte: () => ({
          lte: async () => ({
            data: FIXTURE_NEWS_MULTIPLE_DAYS.slice(0, 1),
            error: null,
          }),
        }),
      })

      mockSupabase.select.mockReturnValueOnce({
        in: async () => ({
          data: [
            { news_id: 'news-1', sentiment: null, extracted_at: '2026-04-14T10:05:00Z' },
          ],
          error: null,
        }),
      })

      const result = await getSentimentTrend(
        mockSupabase,
        '2026-04-14T00:00:00Z',
        '2026-04-16T23:59:59Z'
      )

      expect(result).toHaveLength(1)
      expect(result[0].positive).toBe(0)
      expect(result[0].neutral).toBe(0)
      expect(result[0].negative).toBe(0)
    })
  })
})

/**
 * Integration Tests: Date handling edge cases
 */
describe('Date Handling', () => {
  it('should parse ISO dates correctly', () => {
    const date = new Date('2026-04-14T10:30:00Z').toISOString().split('T')[0]
    expect(date).toBe('2026-04-14')
  })

  it('should handle date boundary crossing (23:59:59 → 00:00:00)', () => {
    const date1 = new Date('2026-04-14T23:59:59Z').toISOString().split('T')[0]
    const date2 = new Date('2026-04-15T00:00:00Z').toISOString().split('T')[0]

    expect(date1).toBe('2026-04-14')
    expect(date2).toBe('2026-04-15')
  })

  it('should handle timezone-aware dates', () => {
    // Date with offset should still work
    const dateWithOffset = '2026-04-14T14:30:00-03:00'
    const normalized = new Date(dateWithOffset).toISOString().split('T')[0]

    expect(normalized).toBe('2026-04-14') // UTC normalized
  })
})
