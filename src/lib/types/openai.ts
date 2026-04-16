/**
 * OpenAI error handling types
 * Shared types for error classification and result wrapping
 */

/**
 * Classification of OpenAI errors into actionable types
 */
export type OpenAIErrorType =
  | 'RateLimitError'
  | 'APIError'
  | 'AuthenticationError'
  | 'ValidationError'
  | 'NetworkError'
  | 'TimeoutError'
  | 'UnknownError'

/**
 * Severity levels for OpenAI errors
 * - fatal: Cannot be recovered automatically, needs manual intervention
 * - degraded: Can be recovered with retry or fallback
 */
export type ErrorSeverity = 'fatal' | 'degraded'

/**
 * OpenAI-specific error details extracted from the error object
 */
export interface OpenAIErrorDetails {
  /** HTTP status code if available */
  status?: number
  /** Error code from OpenAI (e.g., 'invalid_api_key') */
  code?: string
  /** Request ID for debugging */
  requestId?: string
}

/**
 * Context about the API call that failed
 * Used for logging and debugging
 */
export interface OpenAICallContext {
  /** Model being used (e.g., 'gpt-4o-mini') */
  model: string
  /** Max tokens requested */
  maxTokens?: number
  /** Length of input sent to API */
  inputLength?: number
  /** When the call was made */
  timestamp: string
}

/**
 * Detailed error object with classification, context, and retry guidance
 * This allows callers to:
 * - Check error type and severity
 * - Decide whether to retry or fallback
 * - Log with full context
 * - Extract retry-after information
 */
export interface DetailedError {
  /** Error classification (7 types) */
  type: OpenAIErrorType

  /** Human-readable message */
  message: string

  /** Can this error be retried? */
  canRetry: boolean

  /** How severe is this error? */
  severity: ErrorSeverity

  /** Original error object for debugging */
  originalError: Error | null

  /** OpenAI-specific error details if available */
  openaiDetails?: OpenAIErrorDetails

  /** Context about what was being processed */
  context: OpenAICallContext

  /** Suggested retry delay in milliseconds (for rate limits) */
  retryAfterMs?: number
}

/**
 * Quality metrics for tracking OpenAI API reliability
 * Useful for dashboards and monitoring
 */
export interface QualityMetrics {
  /** Whether the call succeeded */
  success: boolean

  /** Type of error if failed */
  errorType?: OpenAIErrorType

  /** Severity of error if failed */
  severity?: ErrorSeverity

  /** Model being used */
  model: string
}

/**
 * Result wrapper for OpenAI operations
 * Transparently returns success, error, and quality info
 * Allows callers to decide whether to accept result or retry/fallback
 */
export interface TrackedResult<T> {
  /** Whether the operation succeeded */
  success: boolean

  /** Result data (only present if success=true) */
  data?: T

  /** Error details (only present if success=false) */
  error?: DetailedError

  /** Quality metrics for monitoring */
  quality: QualityMetrics
}

/**
 * Result of a single item in a batch operation
 */
export interface BatchItemResult {
  /** Item identifier */
  newsId: string

  /** Whether this item succeeded */
  success: boolean

  /** Error details if failed */
  error?: DetailedError

  /** Quality metrics for this item */
  quality: {
    errorType?: OpenAIErrorType
    severity?: ErrorSeverity
    attemptedRetry: boolean
  }
}

/**
 * Summary of a batch operation
 * Includes breakdown by error type for analysis
 */
export interface BatchResult {
  /** Total items processed */
  total: number

  /** Successful items */
  successful: number

  /** Failed items */
  failed: number

  /** Individual results for each item */
  results: BatchItemResult[]

  /** Count of each error type encountered */
  errorsByType: Record<OpenAIErrorType, number>

  /** Success rate as percentage string (e.g., "95.67%") */
  successRate: string
}

/**
 * Configuration for retry strategy
 */
export interface RetryStrategyConfig {
  /** Maximum number of retries */
  maxRetries?: number

  /** Base delay in milliseconds before first retry */
  baseDelayMs?: number

  /** Maximum delay between retries */
  maxDelayMs?: number
}

/**
 * Extracted topics from news analysis
 */
export interface ExtractedTopics {
  topics: Array<{
    name: string
    confidence: number
    category?: string
  }>

  entities: Array<{
    name: string
    type: 'PERSON' | 'ORG' | 'LOCATION' | 'OTHER'
  }>

  sentiment: 'positive' | 'neutral' | 'negative'

  category: string
}

/**
 * Clustered themes for consolidation
 */
export interface ClusteredTheme {
  cluster_name: string
  members: string[]
  confidence: number
}

/**
 * Configuration options for quality metrics storage
 */
export interface QualityMetricsConfig {
  timestamp: Date
  batchSize: number
  successCount: number
  failureCount: number
  errorBreakdown: Record<OpenAIErrorType, number>
  successRate: number
  model: string
  avgResponseTimeMs?: number
  retryCount?: number
}

/**
 * Options for logging errors
 */
export interface ErrorLogOptions {
  /** ID of the news item being processed */
  newsId?: string

  /** Batch size if part of batch operation */
  batchSize?: number

  /** Number of successful items in batch */
  successCount?: number

  /** Number of failed items in batch */
  failureCount?: number

  /** Additional context to include in log */
  metadata?: Record<string, any>
}

/**
 * Retry result after all attempts exhausted
 */
export interface RetryResult<T> {
  success: boolean
  data?: T
  error?: DetailedError
}
