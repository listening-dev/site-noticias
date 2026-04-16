-- ============================================================
-- CIRCUIT BREAKER FALLBACK CACHE TABLE
-- ============================================================
-- Add this migration to implement graceful degradation
-- when OpenAI API is unavailable

-- ============================================================
-- Table: fallback_extraction_cache
-- Purpose: Cache previous NLP extractions for similar content
-- Enables graceful degradation when OpenAI circuit is OPEN
-- ============================================================
CREATE TABLE IF NOT EXISTS noticias.fallback_extraction_cache (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  title           TEXT          NOT NULL,
  description     TEXT,
  extracted_data  JSONB         NOT NULL, -- Stores full ExtractedTopics
  status          TEXT          DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  search_content  tsvector      GENERATED ALWAYS AS (
    to_tsvector('portuguese', COALESCE(title, '') || ' ' || COALESCE(description, ''))
  ) STORED,
  hit_count       INTEGER       DEFAULT 0, -- How many times used for fallback
  last_hit_at     TIMESTAMPTZ,
  similarity_score DECIMAL(3,2) DEFAULT 1.0, -- For ranking cache matches
  created_at      TIMESTAMPTZ   DEFAULT now(),
  updated_at      TIMESTAMPTZ   DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fallback_cache_status
  ON noticias.fallback_extraction_cache (status);

CREATE INDEX IF NOT EXISTS idx_fallback_cache_search_content
  ON noticias.fallback_extraction_cache USING GIN (search_content);

CREATE INDEX IF NOT EXISTS idx_fallback_cache_created_at
  ON noticias.fallback_extraction_cache (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fallback_cache_hit_count
  ON noticias.fallback_extraction_cache (hit_count DESC);

-- Full-text search optimization index
CREATE INDEX IF NOT EXISTS idx_fallback_cache_title_gin
  ON noticias.fallback_extraction_cache USING GIN (to_tsvector('portuguese', title));

-- ============================================================
-- Table: circuit_breaker_health_log
-- Purpose: Track circuit breaker state changes for monitoring
-- Retention: Keep last 30 days of logs
-- ============================================================
CREATE TABLE IF NOT EXISTS noticias.circuit_breaker_health_log (
  id                   UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_name       TEXT          NOT NULL, -- e.g., 'openai-extract-topics'
  state                TEXT          NOT NULL CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  error_rate           DECIMAL(3,2)  DEFAULT 0,
  consecutive_failures INTEGER       DEFAULT 0,
  total_attempts       INTEGER       DEFAULT 0,
  success_count        INTEGER       DEFAULT 0,
  failure_count        INTEGER       DEFAULT 0,
  last_failure_reason  TEXT,
  timestamp            TIMESTAMPTZ   DEFAULT now(),

  -- Fields for analysis
  time_in_state        INTEGER       -- milliseconds
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_circuit_health_operation
  ON noticias.circuit_breaker_health_log (operation_name);

CREATE INDEX IF NOT EXISTS idx_circuit_health_state
  ON noticias.circuit_breaker_health_log (state);

CREATE INDEX IF NOT EXISTS idx_circuit_health_timestamp
  ON noticias.circuit_breaker_health_log (timestamp DESC);

-- Create composite index for queries like "get latest state for each operation"
CREATE INDEX IF NOT EXISTS idx_circuit_health_operation_timestamp
  ON noticias.circuit_breaker_health_log (operation_name, timestamp DESC);

-- ============================================================
-- Table: extraction_quality_metrics
-- Purpose: Track quality of extractions by source
-- Useful for understanding fallback effectiveness
-- ============================================================
CREATE TABLE IF NOT EXISTS noticias.extraction_quality_metrics (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id               UUID          REFERENCES noticias.news(id) ON DELETE CASCADE,
  extraction_source     TEXT          NOT NULL CHECK (extraction_source IN ('openai', 'fallback_cache', 'fallback_rules')),
  extraction_confidence DECIMAL(3,2)  NOT NULL, -- average confidence of topics

  -- Quality indicators
  topic_count           INTEGER       NOT NULL, -- number of topics extracted
  entity_count          INTEGER       NOT NULL, -- number of entities extracted
  sentiment             TEXT          CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  category              TEXT,

  -- Implicit quality feedback (would be enriched through user interaction)
  -- For now: calculated as average confidence of extracted topics

  created_at            TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extraction_quality_source
  ON noticias.extraction_quality_metrics (extraction_source);

CREATE INDEX IF NOT EXISTS idx_extraction_quality_news_id
  ON noticias.extraction_quality_metrics (news_id);

CREATE INDEX IF NOT EXISTS idx_extraction_quality_created_at
  ON noticias.extraction_quality_metrics (created_at DESC);

-- ============================================================
-- Function: Update fallback cache hit tracking
-- ============================================================
CREATE OR REPLACE FUNCTION update_fallback_cache_hit()
RETURNS TRIGGER AS $$
BEGIN
  NEW.hit_count := NEW.hit_count + 1;
  NEW.last_hit_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger when cache is used (would need to be called explicitly in application)
-- This is more of a helper function for the app to call

-- ============================================================
-- View: circuit_breaker_current_status
-- Purpose: Show latest state of each circuit breaker
-- ============================================================
CREATE OR REPLACE VIEW noticias.circuit_breaker_current_status AS
SELECT DISTINCT ON (operation_name)
  operation_name,
  state,
  error_rate,
  consecutive_failures,
  success_count,
  failure_count,
  total_attempts,
  last_failure_reason,
  timestamp,
  time_in_state
FROM noticias.circuit_breaker_health_log
ORDER BY operation_name, timestamp DESC;

-- ============================================================
-- View: extraction_quality_summary
-- Purpose: Compare quality metrics between extraction sources
-- ============================================================
CREATE OR REPLACE VIEW noticias.extraction_quality_summary AS
SELECT
  extraction_source,
  COUNT(*) as total_extractions,
  ROUND(AVG(extraction_confidence)::numeric, 3) as avg_confidence,
  ROUND(AVG(topic_count)::numeric, 1) as avg_topics,
  ROUND(AVG(entity_count)::numeric, 1) as avg_entities,
  MIN(created_at) as first_extraction,
  MAX(created_at) as last_extraction,
  DATE(now() - INTERVAL '1 day') as day
FROM noticias.extraction_quality_metrics
WHERE created_at > now() - INTERVAL '24 hours'
GROUP BY extraction_source;

-- ============================================================
-- View: fallback_cache_effectiveness
-- Purpose: Track how effective fallback cache is
-- ============================================================
CREATE OR REPLACE VIEW noticias.fallback_cache_effectiveness AS
SELECT
  COUNT(*) as total_items,
  SUM(CASE WHEN hit_count > 0 THEN 1 ELSE 0 END) as used_items,
  ROUND(SUM(CASE WHEN hit_count > 0 THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as usage_rate,
  SUM(hit_count) as total_hits,
  ROUND(AVG(hit_count)::numeric, 2) as avg_hits_per_item,
  MAX(last_hit_at) as most_recent_use
FROM noticias.fallback_extraction_cache
WHERE status = 'active';

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE noticias.fallback_extraction_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias.circuit_breaker_health_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias.extraction_quality_metrics ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to view (read-only)
DROP POLICY IF EXISTS "Users view extraction cache" ON noticias.fallback_extraction_cache;
CREATE POLICY "Users view extraction cache"
  ON noticias.fallback_extraction_cache FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Users view circuit health" ON noticias.circuit_breaker_health_log;
CREATE POLICY "Users view circuit health"
  ON noticias.circuit_breaker_health_log FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Users view extraction quality" ON noticias.extraction_quality_metrics;
CREATE POLICY "Users view extraction quality"
  ON noticias.extraction_quality_metrics FOR SELECT
  TO authenticated USING (true);

-- Allow service role to insert (from application)
DROP POLICY IF EXISTS "Service can insert health logs" ON noticias.circuit_breaker_health_log;
CREATE POLICY "Service can insert health logs"
  ON noticias.circuit_breaker_health_log FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service can insert quality metrics" ON noticias.extraction_quality_metrics;
CREATE POLICY "Service can insert quality metrics"
  ON noticias.extraction_quality_metrics FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service can insert cache" ON noticias.fallback_extraction_cache;
CREATE POLICY "Service can insert cache"
  ON noticias.fallback_extraction_cache FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
