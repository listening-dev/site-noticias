-- ============================================================
-- Temas globais (sem referência a clientes)
-- ============================================================

-- Temas extraídos automaticamente via NLP ou criados manualmente
CREATE TABLE noticias.global_themes (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  description TEXT,

  -- Como foi criado: 'nlp_auto' = extraído automaticamente, 'manual' = criado por usuário
  source      TEXT        DEFAULT 'nlp_auto' CHECK (source IN ('nlp_auto', 'manual')),

  -- Status do tema
  status      TEXT        DEFAULT 'active' CHECK (status IN ('active', 'archived')),

  -- Confiança da extração automática (se source = nlp_auto)
  confidence  DECIMAL(3,2),

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_global_themes_name ON noticias.global_themes (name);
CREATE INDEX idx_global_themes_source ON noticias.global_themes (source);
CREATE INDEX idx_global_themes_status ON noticias.global_themes (status);
CREATE INDEX idx_global_themes_updated_at ON noticias.global_themes (updated_at DESC);

-- RLS
ALTER TABLE noticias.global_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view global themes"
  ON noticias.global_themes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage global themes"
  ON noticias.global_themes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM noticias.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- Alertas de crise (quando um tema explode em notícias)
-- ============================================================

CREATE TABLE noticias.crisis_alerts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  theme_id    UUID        REFERENCES noticias.global_themes(id) ON DELETE CASCADE NOT NULL,

  -- Qual cliente foi afetado (NULL = global)
  client_id   UUID        REFERENCES noticias.clients(id) ON DELETE CASCADE,

  -- Severidade da crise
  severity    TEXT        DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Quantas notícias dispararam a crise neste período
  matched_count INTEGER   DEFAULT 0,

  -- Quando começou a crise
  started_at  TIMESTAMPTZ DEFAULT now(),

  -- Quando terminou (NULL = ainda ativa)
  ended_at    TIMESTAMPTZ,

  -- Quem descartou o alerta (se aplicável)
  dismissed_by UUID       REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ,

  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crisis_theme_id ON noticias.crisis_alerts (theme_id);
CREATE INDEX idx_crisis_client_id ON noticias.crisis_alerts (client_id);
CREATE INDEX idx_crisis_severity ON noticias.crisis_alerts (severity);
CREATE INDEX idx_crisis_started_at ON noticias.crisis_alerts (started_at DESC);
CREATE INDEX idx_crisis_active ON noticias.crisis_alerts (ended_at) WHERE ended_at IS NULL;

-- RLS: usuários veem crises de clientes que têm acesso
ALTER TABLE noticias.crisis_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their client crises"
  ON noticias.crisis_alerts FOR SELECT
  USING (
    -- Se for crise global (client_id IS NULL), apenas admins veem
    (client_id IS NULL AND EXISTS (
      SELECT 1 FROM noticias.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    ))
    OR
    -- Se for crise de cliente, usuário atribuído a esse cliente vê
    (client_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM noticias.user_clients uc
      WHERE uc.client_id = crisis_alerts.client_id AND uc.user_id = auth.uid()
    ))
    OR
    -- Admin vê tudo
    EXISTS (
      SELECT 1 FROM noticias.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users dismiss own crises"
  ON noticias.crisis_alerts FOR UPDATE
  USING (
    -- Mesmo acesso de leitura + precisa estar vivo (not dismissed)
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
