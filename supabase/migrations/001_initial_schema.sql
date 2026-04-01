-- ============================================================
-- Central de Notícias Inteligente - Schema Inicial
-- ============================================================

-- Schema dedicado ao projeto
CREATE SCHEMA IF NOT EXISTS noticias;

-- Fontes RSS
CREATE TABLE noticias.sources (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT        NOT NULL,
  rss_url    TEXT        NOT NULL UNIQUE,
  category   TEXT,
  active     BOOLEAN     DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notícias coletadas dos feeds RSS
CREATE TABLE noticias.news (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  title         TEXT        NOT NULL,
  description   TEXT,
  url           TEXT        NOT NULL UNIQUE,
  source_id     UUID        REFERENCES noticias.sources(id) ON DELETE CASCADE,
  category      TEXT,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  search_vector TSVECTOR    GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(title, '') || ' ' || coalesce(description, '')
    )
  ) STORED
);

CREATE INDEX idx_news_search_vector ON noticias.news USING GIN (search_vector);
CREATE INDEX idx_news_published_at  ON noticias.news (published_at DESC);
CREATE INDEX idx_news_source_id     ON noticias.news (source_id);
CREATE INDEX idx_news_category      ON noticias.news (category);

-- Clientes monitorados
CREATE TABLE noticias.clients (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Filtros booleanos por cliente (ex: "ministério AND transportes NOT ferrovias")
CREATE TABLE noticias.client_filters (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     UUID        REFERENCES noticias.clients(id) ON DELETE CASCADE,
  label         TEXT,
  boolean_query TEXT        NOT NULL,
  tsquery_value TEXT,
  active        BOOLEAN     DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Cache de notícias que bateram com os filtros de cada cliente
CREATE TABLE noticias.client_news (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id  UUID        REFERENCES noticias.clients(id) ON DELETE CASCADE,
  news_id    UUID        REFERENCES noticias.news(id) ON DELETE CASCADE,
  filter_id  UUID        REFERENCES noticias.client_filters(id) ON DELETE SET NULL,
  matched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, news_id)
);

CREATE INDEX idx_client_news_client ON noticias.client_news (client_id);
CREATE INDEX idx_client_news_news   ON noticias.client_news (news_id);

-- Vínculo usuário ↔ cliente (controle de acesso)
CREATE TABLE noticias.user_clients (
  user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES noticias.clients(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, client_id)
);

-- Perfil de usuário (role: admin ou analyst)
CREATE TABLE noticias.user_profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email      TEXT,
  full_name  TEXT,
  role       TEXT DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Favoritos por usuário
CREATE TABLE noticias.user_favorites (
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  news_id    UUID        REFERENCES noticias.news(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, news_id)
);

-- Notícias marcadas como lidas por usuário
CREATE TABLE noticias.user_read_news (
  user_id UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  news_id UUID        REFERENCES noticias.news(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, news_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE noticias.sources       ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias.news          ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias.clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias.client_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias.client_news   ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias.user_clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE noticias.user_read_news ENABLE ROW LEVEL SECURITY;

-- Fontes: qualquer autenticado pode ver
CREATE POLICY "Authenticated can view sources"
  ON noticias.sources FOR SELECT
  TO authenticated USING (true);

-- Notícias: qualquer autenticado pode ver
CREATE POLICY "Authenticated can view news"
  ON noticias.news FOR SELECT
  TO authenticated USING (true);

-- Perfil: cada usuário vê o próprio
CREATE POLICY "Users view own profile"
  ON noticias.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON noticias.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Clientes: analista vê apenas os vinculados a ele; admin vê todos
CREATE POLICY "Users view their clients"
  ON noticias.clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM noticias.user_clients uc
      WHERE uc.client_id = clients.id AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM noticias.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- Filtros de cliente: acompanha acesso ao cliente
CREATE POLICY "Users view client filters"
  ON noticias.client_filters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM noticias.user_clients uc
      WHERE uc.client_id = client_filters.client_id AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM noticias.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- Notícias de cliente: analista vê apenas seus clientes
CREATE POLICY "Users view their client news"
  ON noticias.client_news FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM noticias.user_clients uc
      WHERE uc.client_id = client_news.client_id AND uc.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM noticias.user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'admin'
    )
  );

-- user_clients: cada um vê os seus
CREATE POLICY "Users view their user_clients"
  ON noticias.user_clients FOR SELECT
  USING (auth.uid() = user_id);

-- Favoritos: cada um gerencia os próprios
CREATE POLICY "Users manage own favorites"
  ON noticias.user_favorites FOR ALL
  USING (auth.uid() = user_id);

-- Lidas: cada um gerencia as próprias
CREATE POLICY "Users manage own read news"
  ON noticias.user_read_news FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- Trigger: criar perfil automaticamente ao registrar
-- ============================================================

CREATE OR REPLACE FUNCTION noticias.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO noticias.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'analyst'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION noticias.handle_new_user();
