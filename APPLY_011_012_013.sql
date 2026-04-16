-- ============================================================
-- DASH NOTÍCIAS — APPLY MIGRATIONS 011 + 012 + 013
-- ============================================================
-- Virada arquitetural Y estrita:
--   Aba do cliente = notícias que matcham ≥1 booleana ativa,
--   restritas a linked_sources quando houver.
--
-- Cole este script inteiro no SQL Editor do Supabase Dashboard
-- e execute. As 3 migrations estão empacotadas em transação para
-- rollback automático em caso de erro.
--
-- ⚠️ IMPACTO:
--   - A migration 011 reescreve a tabela noticias.news inteira
--     (recompute do search_vector). Volume grande → minutos de
--     lock de write. Rodar em janela de baixo tráfego.
--   - A migration 013 limpa noticias.client_news do GHC apenas.
--     Outros clientes permanecem intactos.
--   - Usuários, favoritos, leituras, tópicos: 100% preservados.
-- ============================================================

BEGIN;

-- ============================================================
-- 011 — Busca insensível a acentos (unaccent)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION noticias.immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT extensions.unaccent('extensions.unaccent', $1) $$;

ALTER TABLE noticias.news DROP COLUMN IF EXISTS search_vector;

ALTER TABLE noticias.news ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector(
      'portuguese',
      noticias.immutable_unaccent(coalesce(title, '') || ' ' || coalesce(description, ''))
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_news_search_vector
  ON noticias.news USING GIN (search_vector);

COMMENT ON COLUMN noticias.news.search_vector IS
  'TSVECTOR em português com unaccent. Queries devem aplicar noticias.immutable_unaccent no texto da tsquery antes de chamar to_tsquery.';

-- ============================================================
-- 012 — RPC com restrição opcional por fontes
-- ============================================================
CREATE OR REPLACE FUNCTION noticias.match_news_by_tsquery_safe(
  tsquery_text TEXT,
  since_date TIMESTAMPTZ,
  fallback_to_simple BOOLEAN DEFAULT FALSE,
  source_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(id UUID) AS $$
DECLARE
  v_tsquery TEXT;
  v_keywords TEXT[];
BEGIN
  IF NOT noticias.validate_tsquery(tsquery_text) THEN
    IF fallback_to_simple THEN
      v_keywords := regexp_split_to_table(
        regexp_replace(tsquery_text, '[&|!()''"-]', ' ', 'g'),
        '\s+'
      )
      FILTER (WHERE regexp_split_to_table != '')::TEXT[];

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
        RETURN;
      END IF;
    ELSE
      RETURN;
    END IF;
  ELSE
    v_tsquery := tsquery_text;
  END IF;

  RETURN QUERY
    SELECT n.id
    FROM noticias.news n
    WHERE n.published_at >= since_date
      AND n.search_vector @@ to_tsquery('portuguese', noticias.immutable_unaccent(v_tsquery))
      AND (source_ids IS NULL OR n.source_id = ANY(source_ids))
    ORDER BY n.published_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION noticias.match_news_by_tsquery_safe IS
  'Retorna news.id que matcham a tsquery. Aplica unaccent. Se source_ids informado, restringe às fontes.';

-- ============================================================
-- 013 — Booleanas iniciais do GHC + limpa client_news antigo
-- ============================================================
DO $$
DECLARE
  v_client_id UUID;
BEGIN
  SELECT id INTO v_client_id
  FROM noticias.clients
  WHERE name = 'Grupo Hospitalar Conceição (GHC)';

  IF v_client_id IS NULL THEN
    RAISE NOTICE 'Cliente GHC não encontrado — seed de booleanas ignorado';
  ELSE
    INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
    VALUES (gen_random_uuid(), v_client_id, 'Instituição GHC',
      '"Grupo Hospitalar Conceição" OR GHC OR "Hospital Nossa Senhora da Conceição" OR "Hospital Conceição"',
      true);

    INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
    VALUES (gen_random_uuid(), v_client_id, 'Hospitais do grupo',
      '"Hospital da Criança Conceição" OR "Hospital Cristo Redentor" OR "Hospital Fêmina" OR "Hospital Nossa Senhora da Conceição"',
      true);

    INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
    VALUES (gen_random_uuid(), v_client_id, 'SUS + saúde pública RS',
      'SUS AND ("Rio Grande do Sul" OR "Porto Alegre" OR gaúcho OR gaúcha)',
      true);

    DELETE FROM noticias.client_news
    WHERE client_id = v_client_id;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- VERIFY — rode após o COMMIT para confirmar tudo aplicou
-- ============================================================

-- 1. Extensão unaccent existe?
SELECT extname, extversion FROM pg_extension WHERE extname = 'unaccent';

-- 2. Wrapper imutável existe?
SELECT proname, provolatile FROM pg_proc
WHERE proname = 'immutable_unaccent'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'noticias');
-- provolatile deve ser 'i' (IMMUTABLE)

-- 3. search_vector foi recriado aplicando unaccent?
SELECT
  pg_get_expr(adbin, adrelid) AS search_vector_expr
FROM pg_attrdef
WHERE adrelid = 'noticias.news'::regclass
  AND adnum = (
    SELECT attnum FROM pg_attribute
    WHERE attrelid = 'noticias.news'::regclass AND attname = 'search_vector'
  );
-- Deve conter "immutable_unaccent"

-- 4. RPC aceita source_ids agora?
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'match_news_by_tsquery_safe'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'noticias');
-- args deve incluir "source_ids uuid[] DEFAULT NULL"

-- 5. GHC tem as 3 booleanas novas?
SELECT f.label, f.boolean_query, f.active
FROM noticias.client_filters f
JOIN noticias.clients c ON c.id = f.client_id
WHERE c.name = 'Grupo Hospitalar Conceição (GHC)'
ORDER BY f.label;

-- 6. Amostra de search_vector num acento qualquer (sanity check)
SELECT title, search_vector
FROM noticias.news
WHERE title ILIKE '%conceição%' OR title ILIKE '%agrário%'
LIMIT 3;
-- Os lexemas no search_vector devem estar sem acento
-- (ex: 'conceica' ao invés de 'conceiçã')
