-- ============================================================
-- DASH NOTÍCIAS - APLICAR TODAS AS MIGRATIONS
-- ============================================================
-- Cole este script inteiro no SQL Editor do Supabase
-- e execute tudo de uma vez
-- ============================================================

-- ============================================================
-- 006: TÓPICOS EXTRAÍDOS DE NOTÍCIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS noticias.news_topics (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id     UUID        REFERENCES noticias.news(id) ON DELETE CASCADE NOT NULL,
  topics      JSONB       DEFAULT '[]'::jsonb,
  entities    JSONB       DEFAULT '[]'::jsonb,
  sentiment   TEXT        CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  category    TEXT,
  extracted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(news_id)
);

CREATE INDEX IF NOT EXISTS idx_news_topics_news_id ON noticias.news_topics (news_id);
CREATE INDEX IF NOT EXISTS idx_news_topics_sentiment ON noticias.news_topics (sentiment);
CREATE INDEX IF NOT EXISTS idx_news_topics_category ON noticias.news_topics (category);
CREATE INDEX IF NOT EXISTS idx_news_topics_extracted_at ON noticias.news_topics (extracted_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_topics_topics_gin ON noticias.news_topics USING GIN (topics);
CREATE INDEX IF NOT EXISTS idx_news_topics_entities_gin ON noticias.news_topics USING GIN (entities);

ALTER TABLE noticias.news_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view topics of visible news" ON noticias.news_topics;
CREATE POLICY "Users view topics of visible news"
  ON noticias.news_topics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM noticias.news n
      WHERE n.id = news_topics.news_id
    )
  );

-- ============================================================
-- 007: TEMAS GLOBAIS E ALERTAS DE CRISE
-- ============================================================
CREATE TABLE IF NOT EXISTS noticias.global_themes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  description TEXT,
  source      TEXT        DEFAULT 'nlp_auto' CHECK (source IN ('nlp_auto', 'manual')),
  status      TEXT        DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  confidence  DECIMAL(3,2),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_themes_name ON noticias.global_themes (name);
CREATE INDEX IF NOT EXISTS idx_global_themes_source ON noticias.global_themes (source);
CREATE INDEX IF NOT EXISTS idx_global_themes_status ON noticias.global_themes (status);
CREATE INDEX IF NOT EXISTS idx_global_themes_updated_at ON noticias.global_themes (updated_at DESC);

ALTER TABLE noticias.global_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view global themes" ON noticias.global_themes;
CREATE POLICY "Authenticated view global themes"
  ON noticias.global_themes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage global themes" ON noticias.global_themes;
CREATE POLICY "Admins manage global themes"
  ON noticias.global_themes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM noticias.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Alertas de Crise
CREATE TABLE IF NOT EXISTS noticias.crisis_alerts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  theme_id    UUID        REFERENCES noticias.global_themes(id) ON DELETE CASCADE NOT NULL,
  client_id   UUID        REFERENCES noticias.clients(id) ON DELETE CASCADE,
  severity    TEXT        DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  matched_count INTEGER   DEFAULT 0,
  started_at  TIMESTAMPTZ DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  dismissed_by UUID       REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crisis_theme_id ON noticias.crisis_alerts (theme_id);
CREATE INDEX IF NOT EXISTS idx_crisis_client_id ON noticias.crisis_alerts (client_id);
CREATE INDEX IF NOT EXISTS idx_crisis_severity ON noticias.crisis_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_crisis_started_at ON noticias.crisis_alerts (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_crisis_active ON noticias.crisis_alerts (ended_at) WHERE ended_at IS NULL;

ALTER TABLE noticias.crisis_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view their client crises" ON noticias.crisis_alerts;
CREATE POLICY "Users view their client crises"
  ON noticias.crisis_alerts FOR SELECT
  USING (
    (client_id IS NULL AND EXISTS (
      SELECT 1 FROM noticias.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    ))
    OR
    (client_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM noticias.user_clients uc
      WHERE uc.client_id = crisis_alerts.client_id AND uc.user_id = auth.uid()
    ))
    OR
    EXISTS (
      SELECT 1 FROM noticias.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users dismiss own crises" ON noticias.crisis_alerts;
CREATE POLICY "Users dismiss own crises"
  ON noticias.crisis_alerts FOR UPDATE
  USING (
    (
      (client_id IS NULL AND EXISTS (
        SELECT 1 FROM noticias.user_profiles
        WHERE id = auth.uid() AND role = 'admin'
      ))
      OR
      (client_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM noticias.user_clients uc
        WHERE uc.client_id = crisis_alerts.client_id AND uc.user_id = auth.uid()
      ))
      OR
      EXISTS (
        SELECT 1 FROM noticias.user_profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
    AND dismissed_at IS NULL
  );

-- ============================================================
-- 008: TEMAS POR CLIENTE E MATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS noticias.client_themes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     UUID        REFERENCES noticias.clients(id) ON DELETE CASCADE NOT NULL,
  name          TEXT        NOT NULL,
  description   TEXT,
  boolean_query TEXT,
  tsquery_value TEXT,
  nlp_enabled   BOOLEAN     DEFAULT false,
  crisis_threshold INTEGER DEFAULT 5,
  status        TEXT        DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, name)
);

CREATE INDEX IF NOT EXISTS idx_client_themes_client_id ON noticias.client_themes (client_id);
CREATE INDEX IF NOT EXISTS idx_client_themes_name ON noticias.client_themes (name);
CREATE INDEX IF NOT EXISTS idx_client_themes_status ON noticias.client_themes (status);
CREATE INDEX IF NOT EXISTS idx_client_themes_nlp_enabled ON noticias.client_themes (nlp_enabled);

ALTER TABLE noticias.client_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view their client themes" ON noticias.client_themes;
CREATE POLICY "Users view their client themes"
  ON noticias.client_themes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM noticias.user_clients uc
      WHERE uc.client_id = client_themes.client_id AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM noticias.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins manage all client themes" ON noticias.client_themes;
CREATE POLICY "Admins manage all client themes"
  ON noticias.client_themes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM noticias.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Matches de Temas
CREATE TABLE IF NOT EXISTS noticias.client_theme_matches (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id         UUID        REFERENCES noticias.clients(id) ON DELETE CASCADE NOT NULL,
  news_id           UUID        REFERENCES noticias.news(id) ON DELETE CASCADE NOT NULL,
  theme_id          UUID        REFERENCES noticias.client_themes(id) ON DELETE CASCADE NOT NULL,
  match_reason      TEXT        CHECK (match_reason IN ('boolean', 'nlp_match', 'source_linked')),
  confidence        DECIMAL(3,2),
  matched_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, news_id, theme_id)
);

CREATE INDEX IF NOT EXISTS idx_client_theme_matches_client ON noticias.client_theme_matches (client_id);
CREATE INDEX IF NOT EXISTS idx_client_theme_matches_news ON noticias.client_theme_matches (news_id);
CREATE INDEX IF NOT EXISTS idx_client_theme_matches_theme ON noticias.client_theme_matches (theme_id);
CREATE INDEX IF NOT EXISTS idx_client_theme_matches_matched_at ON noticias.client_theme_matches (matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_theme_matches_reason ON noticias.client_theme_matches (match_reason);

ALTER TABLE noticias.client_theme_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view their client theme matches" ON noticias.client_theme_matches;
CREATE POLICY "Users view their client theme matches"
  ON noticias.client_theme_matches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM noticias.user_clients uc
      WHERE uc.client_id = client_theme_matches.client_id AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM noticias.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- ============================================================
-- 009: EXPANSÃO DE ROLES
-- ============================================================
ALTER TABLE noticias.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE noticias.user_profiles
ADD CONSTRAINT user_profiles_role_check
CHECK (role IN ('admin', 'analyst', 'account_manager', 'strategist'));

ALTER TABLE noticias.user_profiles
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Função segura para obter informações de role (apenas do usuário autenticado)
DROP FUNCTION IF EXISTS noticias.get_current_user_role() CASCADE;
CREATE FUNCTION noticias.get_current_user_role()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  role_label TEXT,
  access_level TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = noticias, public
AS $$
SELECT
  id,
  email,
  full_name,
  role,
  CASE role
    WHEN 'admin' THEN 'Administrador'
    WHEN 'analyst' THEN 'Analista de Mídia'
    WHEN 'account_manager' THEN 'Account Manager'
    WHEN 'strategist' THEN 'Estrategista'
  END AS role_label,
  CASE role
    WHEN 'admin' THEN 'full'
    WHEN 'analyst' THEN 'analyst'
    WHEN 'account_manager' THEN 'account_manager'
    WHEN 'strategist' THEN 'strategist'
  END AS access_level
FROM noticias.user_profiles
WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION noticias.get_current_user_role() TO authenticated;

-- ============================================================
-- ✅ TODAS AS MIGRATIONS APLICADAS COM SUCESSO!
-- ============================================================
-- Próximos passos:
-- 1. Verificar que as tabelas foram criadas em Supabase > SQL Editor
-- 2. Rodar os endpoints: /api/cron/fetch-feeds e /api/cron/detect-crises
-- 3. Testar os dashboards
-- ============================================================
