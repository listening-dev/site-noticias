-- ============================================================
-- DENORMALIZATION: Flattened topic_mentions table
-- Replaces JSONB full-scans in news_topics.topics with indexed rows
-- ============================================================

-- Create denormalized table: each topic extracted from JSONB becomes a row
CREATE TABLE noticias.topic_mentions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id UUID REFERENCES noticias.news(id) ON DELETE CASCADE NOT NULL,

  -- Flattened from news_topics.topics JSONB array
  topic_name TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5,
  topic_category TEXT,

  -- Denormalized from news_topics for aggregation
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),

  -- Timestamp
  mentioned_at TIMESTAMPTZ DEFAULT now(),

  -- One row per (news, topic) pair
  UNIQUE(news_id, topic_name)
);

-- ============================================================
-- INDEXES for O(log n) lookup by topic_name
-- ============================================================

-- Primary: topic lookup (most common query)
CREATE INDEX idx_topic_mentions_topic_name
  ON noticias.topic_mentions (topic_name);

-- Secondary: date range queries
CREATE INDEX idx_topic_mentions_mentioned_at
  ON noticias.topic_mentions (mentioned_at DESC);

-- Composite: topic + date (for crisis detection time windows)
CREATE INDEX idx_topic_mentions_topic_date
  ON noticias.topic_mentions (topic_name, mentioned_at DESC);

-- Sentiment aggregation
CREATE INDEX idx_topic_mentions_sentiment
  ON noticias.topic_mentions (sentiment);

-- Category filtering
CREATE INDEX idx_topic_mentions_category
  ON noticias.topic_mentions (topic_category);

-- News lookup (for backfill and sync)
CREATE INDEX idx_topic_mentions_news_id
  ON noticias.topic_mentions (news_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE noticias.topic_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view mentions of their news"
  ON noticias.topic_mentions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM noticias.news n
      WHERE n.id = topic_mentions.news_id
    )
  );

-- ============================================================
-- AUTO-SYNC TRIGGER
-- Keeps topic_mentions in sync when news_topics.topics changes
-- ============================================================

CREATE OR REPLACE FUNCTION noticias.sync_topic_mentions()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete old mentions for this news
  DELETE FROM noticias.topic_mentions WHERE news_id = NEW.news_id;

  -- Re-insert flattened topics from JSONB array
  INSERT INTO noticias.topic_mentions (
    news_id,
    topic_name,
    confidence,
    topic_category,
    sentiment,
    mentioned_at
  )
  SELECT
    NEW.news_id,
    COALESCE((topic->>'name')::TEXT, '')::TEXT,
    COALESCE((topic->>'confidence')::FLOAT, 0.5),
    topic->>'category',
    NEW.sentiment,
    NEW.extracted_at
  FROM jsonb_array_elements(COALESCE(NEW.topics, '[]'::jsonb)) AS topic
  WHERE (topic->>'name') IS NOT NULL AND (topic->>'name')::TEXT != '';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_topic_mentions
  AFTER INSERT OR UPDATE ON noticias.news_topics
  FOR EACH ROW
  EXECUTE FUNCTION noticias.sync_topic_mentions();

-- ============================================================
-- VALIDATION FUNCTIONS FOR TSQUERY
-- ============================================================

-- Test if a tsquery string is valid PostgreSQL syntax
CREATE OR REPLACE FUNCTION noticias.validate_tsquery(
  tsquery_text TEXT,
  language TEXT DEFAULT 'portuguese'
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Try to parse the tsquery; if it fails, catch exception
  PERFORM to_tsquery(language, tsquery_text);
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STRICT IMMUTABLE;

-- ============================================================
-- ENHANCED MATCH RPC WITH TSQUERY VALIDATION
-- ============================================================

CREATE OR REPLACE FUNCTION noticias.match_news_by_tsquery_safe(
  tsquery_text TEXT,
  since_date TIMESTAMPTZ,
  fallback_to_simple BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(id UUID) AS $$
DECLARE
  v_tsquery TEXT;
  v_keywords TEXT[];
BEGIN
  -- Validate tsquery syntax
  IF NOT noticias.validate_tsquery(tsquery_text) THEN
    IF fallback_to_simple THEN
      -- Fallback: extract keywords and build simple AND query
      -- Remove operators and special chars
      v_keywords := regexp_split_to_table(
        regexp_replace(tsquery_text, '[&|!()\'"\-]', ' ', 'g'),
        '\s+'
      )
      FILTER (WHERE regexp_split_to_table != '')::TEXT[];

      -- Build comma-separated keyword list (max 10)
      v_tsquery := (
        SELECT string_agg(
          '''' || word || '''',
          ' & '
          ORDER BY length(word) DESC
        )
        FROM unnest(v_keywords[1:10]) AS word
        WHERE length(word) > 0
      );

      IF v_tsquery IS NULL OR v_tsquery = '' THEN
        RETURN; -- Empty result if no valid keywords
      END IF;
    ELSE
      -- No fallback: return empty if invalid
      RETURN;
    END IF;
  ELSE
    v_tsquery := tsquery_text;
  END IF;

  -- Execute validated tsquery
  RETURN QUERY
    SELECT n.id
    FROM noticias.news n
    WHERE n.published_at >= since_date
      AND n.search_vector @@ to_tsquery('portuguese', v_tsquery)
    ORDER BY n.published_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- CRISIS DETECTION RPC (by theme_id using topic_mentions)
-- ============================================================

-- Count recent mentions of a theme by matching topic names
CREATE OR REPLACE FUNCTION noticias.count_recent_topic_mentions(
  p_theme_id UUID,
  p_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(mention_count BIGINT) AS $$
BEGIN
  RETURN QUERY
    SELECT COUNT(DISTINCT tm.news_id)::BIGINT
    FROM noticias.topic_mentions tm
    INNER JOIN noticias.global_themes gt
      ON LOWER(tm.topic_name) = LOWER(gt.name)
    WHERE gt.id = p_theme_id
      AND tm.mentioned_at >= NOW() - (p_minutes || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- BACKFILL FUNCTION
-- Populates topic_mentions from existing news_topics JSONB data
-- ============================================================

CREATE OR REPLACE FUNCTION noticias.backfill_topic_mentions(p_limit INT DEFAULT 5000)
RETURNS TABLE(backfilled_count INT) AS $$
DECLARE
  v_count INT := 0;
  v_record RECORD;
BEGIN
  -- Process news_topics rows without backfill marker
  FOR v_record IN
    SELECT nt.id, nt.news_id, nt.topics, nt.sentiment, nt.extracted_at
    FROM noticias.news_topics nt
    LEFT JOIN noticias.topic_mentions tm ON tm.news_id = nt.news_id
    WHERE tm.id IS NULL
    LIMIT p_limit
  LOOP
    -- Flatten JSONB topics array into topic_mentions rows
    INSERT INTO noticias.topic_mentions (
      news_id,
      topic_name,
      confidence,
      topic_category,
      sentiment,
      mentioned_at
    )
    SELECT
      v_record.news_id,
      COALESCE((topic->>'name')::TEXT, '')::TEXT,
      COALESCE((topic->>'confidence')::FLOAT, 0.5),
      topic->>'category',
      v_record.sentiment,
      v_record.extracted_at
    FROM jsonb_array_elements(COALESCE(v_record.topics, '[]'::jsonb)) AS topic
    WHERE (topic->>'name') IS NOT NULL AND (topic->>'name')::TEXT != ''
    ON CONFLICT (news_id, topic_name) DO NOTHING;

    v_count := v_count + (SELECT COUNT(*) FROM noticias.topic_mentions WHERE news_id = v_record.news_id);
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- GRANTS & SECURITY
-- ============================================================

-- Allow authenticated users to read topic_mentions
GRANT SELECT ON noticias.topic_mentions TO authenticated;

-- Allow functions to be called by app
GRANT EXECUTE ON FUNCTION noticias.validate_tsquery TO authenticated;
GRANT EXECUTE ON FUNCTION noticias.match_news_by_tsquery_safe TO authenticated;
GRANT EXECUTE ON FUNCTION noticias.count_recent_topic_mentions TO authenticated;
GRANT EXECUTE ON FUNCTION noticias.backfill_topic_mentions TO authenticated;
