-- ============================================================
-- Tópicos extraídos de notícias (via OpenAI NLP)
-- ============================================================

-- Tabela que armazena tópicos, entidades e sentimento extraídos
CREATE TABLE noticias.news_topics (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id     UUID        REFERENCES noticias.news(id) ON DELETE CASCADE NOT NULL,

  -- Tópicos principais extraídos (JSONB array de objetos)
  -- [{name: "inflação", confidence: 0.95, category: "economia"}, ...]
  topics      JSONB       DEFAULT '[]'::jsonb,

  -- Entidades mencionadas (pessoas, empresas, locais)
  -- [{name: "Lula", type: "PERSON"}, {name: "Banco do Brasil", type: "ORG"}, ...]
  entities    JSONB       DEFAULT '[]'::jsonb,

  -- Sentimento geral da notícia
  sentiment   TEXT        CHECK (sentiment IN ('positive', 'neutral', 'negative')),

  -- Categoria automática
  category    TEXT,

  -- Quando foi extraído (pode ser diferente de news.created_at)
  extracted_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(news_id)
);

CREATE INDEX idx_news_topics_news_id ON noticias.news_topics (news_id);
CREATE INDEX idx_news_topics_sentiment ON noticias.news_topics (sentiment);
CREATE INDEX idx_news_topics_category ON noticias.news_topics (category);
CREATE INDEX idx_news_topics_extracted_at ON noticias.news_topics (extracted_at DESC);

-- Índice GIN para buscar tópicos rapidamente
CREATE INDEX idx_news_topics_topics_gin ON noticias.news_topics USING GIN (topics);
CREATE INDEX idx_news_topics_entities_gin ON noticias.news_topics USING GIN (entities);

-- RLS: usuários autenticados podem ver tópicos de notícias que têm acesso
ALTER TABLE noticias.news_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view topics of visible news"
  ON noticias.news_topics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM noticias.news n
      WHERE n.id = news_topics.news_id
    )
  );
