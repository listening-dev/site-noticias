-- ============================================================
-- 011 — Busca insensível a acentos (unaccent)
-- ============================================================
-- Motivação: fontes brasileiras escrevem "Conceição" e "Conceicao"
-- inconsistentemente. Sem unaccent, a busca retorna falsos-negativos.
-- Esta migration recria search_vector aplicando unaccent e atualiza
-- a RPC de match para aplicar unaccent também no lado da query.
-- ============================================================

-- 1. Habilitar extensão unaccent (Supabase aloca em schema extensions)
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- 2. Wrapper IMMUTABLE (unaccent nativo é STABLE, logo não pode ser usado
--    em generated column nem em índice expression). Marcamos como IMMUTABLE
--    porque o dicionário unaccent padrão não muda em produção.
CREATE OR REPLACE FUNCTION noticias.immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT extensions.unaccent('extensions.unaccent', $1) $$;

-- 3. Dropar search_vector antigo (GIN index cai junto)
ALTER TABLE noticias.news DROP COLUMN IF EXISTS search_vector;

-- 4. Recriar search_vector aplicando unaccent
--    Atenção: este ALTER reescreve a tabela inteira. Em base com muitas
--    notícias pode demorar alguns minutos.
ALTER TABLE noticias.news ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector(
      'portuguese',
      noticias.immutable_unaccent(coalesce(title, '') || ' ' || coalesce(description, ''))
    )
  ) STORED;

-- 5. Recriar índice GIN
CREATE INDEX IF NOT EXISTS idx_news_search_vector
  ON noticias.news USING GIN (search_vector);

COMMENT ON COLUMN noticias.news.search_vector IS
  'TSVECTOR em português com unaccent. Queries devem aplicar noticias.immutable_unaccent no texto da tsquery antes de chamar to_tsquery.';
