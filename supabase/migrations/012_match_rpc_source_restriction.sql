-- ============================================================
-- 012 — RPC de match com restrição opcional por fontes
-- ============================================================
-- Motivação: sob a nova semântica (Y estrito), uma notícia só entra
-- no cliente se (a) matchar ao menos 1 booleana ativa E (b) vier de
-- uma fonte vinculada (quando o cliente tem client_sources).
-- A RPC anterior não aceitava restrição por source_id; esta aceita.
-- Também aplica unaccent no texto da tsquery (ver migration 011).
--
-- Nota (2026-04-16): versão original dependia de
-- noticias.validate_tsquery, que estava ausente/quebrada na base
-- (bug histórico na migration 010). Substituído por EXCEPTION WHEN
-- OTHERS que captura tsquery inválida silenciosamente e retorna
-- conjunto vazio.
-- ============================================================

CREATE OR REPLACE FUNCTION noticias.match_news_by_tsquery_safe(
  tsquery_text TEXT,
  since_date TIMESTAMPTZ,
  fallback_to_simple BOOLEAN DEFAULT FALSE,
  source_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(id UUID) AS $$
BEGIN
  RETURN QUERY
    SELECT n.id
    FROM noticias.news n
    WHERE n.published_at >= since_date
      AND n.search_vector @@ to_tsquery('portuguese', noticias.immutable_unaccent(tsquery_text))
      AND (source_ids IS NULL OR n.source_id = ANY(source_ids))
    ORDER BY n.published_at DESC;
EXCEPTION WHEN OTHERS THEN
  -- Tsquery inválida ou qualquer erro no parse → retorna vazio.
  -- fallback_to_simple mantido na assinatura por compatibilidade mas
  -- não mais necessário (a validação acontece via exception handler).
  RETURN;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION noticias.match_news_by_tsquery_safe(TEXT, TIMESTAMPTZ, BOOLEAN, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION noticias.match_news_by_tsquery_safe(TEXT, TIMESTAMPTZ, BOOLEAN, UUID[]) TO service_role;

COMMENT ON FUNCTION noticias.match_news_by_tsquery_safe IS
  'Retorna news.id que matcham a tsquery. Aplica unaccent. Se source_ids informado, restringe às fontes. Tsquery inválida → retorna vazio.';
