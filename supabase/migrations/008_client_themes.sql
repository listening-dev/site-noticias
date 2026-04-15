-- ============================================================
-- Temas por cliente (booleanos + NLP automático)
-- ============================================================

-- Temas específicos que cada cliente monitora
CREATE TABLE noticias.client_themes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     UUID        REFERENCES noticias.clients(id) ON DELETE CASCADE NOT NULL,
  name          TEXT        NOT NULL,
  description   TEXT,

  -- Filtro booleano (ex: "ministério AND transportes NOT ferrovias")
  -- Se vazio, usa apenas NLP automático
  boolean_query TEXT,

  -- Versão compilada do booleano para PostgreSQL
  tsquery_value TEXT,

  -- Se true, tema automaticamente detecta novos tópicos de notícias
  -- (via NLP, não apenas booleano)
  nlp_enabled   BOOLEAN     DEFAULT false,

  -- Threshold de notícias/hora para marcar crise
  crisis_threshold INTEGER DEFAULT 5,

  -- Status do tema
  status        TEXT        DEFAULT 'active' CHECK (status IN ('active', 'archived')),

  -- Notas internas
  notes         TEXT,

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE(client_id, name)
);

CREATE INDEX idx_client_themes_client_id ON noticias.client_themes (client_id);
CREATE INDEX idx_client_themes_name ON noticias.client_themes (name);
CREATE INDEX idx_client_themes_status ON noticias.client_themes (status);
CREATE INDEX idx_client_themes_nlp_enabled ON noticias.client_themes (nlp_enabled);

-- RLS: usuários veem temas de clientes que estão assignados
ALTER TABLE noticias.client_themes ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Admins manage all client themes"
  ON noticias.client_themes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM noticias.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- Matches: notícias que bateram com temas de cliente
-- ============================================================

-- Cache de notícias que matcharam com temas de cada cliente
-- Estende a funcionalidade de client_news
CREATE TABLE noticias.client_theme_matches (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id         UUID        REFERENCES noticias.clients(id) ON DELETE CASCADE NOT NULL,
  news_id           UUID        REFERENCES noticias.news(id) ON DELETE CASCADE NOT NULL,
  theme_id          UUID        REFERENCES noticias.client_themes(id) ON DELETE CASCADE NOT NULL,

  -- Como o match aconteceu
  match_reason      TEXT        CHECK (match_reason IN ('boolean', 'nlp_match', 'source_linked')),

  -- Confiança do match (0-1)
  confidence        DECIMAL(3,2),

  matched_at        TIMESTAMPTZ DEFAULT now(),

  UNIQUE(client_id, news_id, theme_id)
);

CREATE INDEX idx_client_theme_matches_client ON noticias.client_theme_matches (client_id);
CREATE INDEX idx_client_theme_matches_news ON noticias.client_theme_matches (news_id);
CREATE INDEX idx_client_theme_matches_theme ON noticias.client_theme_matches (theme_id);
CREATE INDEX idx_client_theme_matches_matched_at ON noticias.client_theme_matches (matched_at DESC);
CREATE INDEX idx_client_theme_matches_reason ON noticias.client_theme_matches (match_reason);

-- RLS: usuários veem matches de clientes que estão assignados
ALTER TABLE noticias.client_theme_matches ENABLE ROW LEVEL SECURITY;

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
