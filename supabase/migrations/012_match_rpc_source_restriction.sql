-- ============================================================
-- 012 — RPC de match com restrição opcional por fontes
-- ============================================================
-- Motivação: sob a nova semântica (Y estrito), uma notícia só entra
-- no cliente se (a) matchar ao menos 1 booleana ativa E (b) vier de
-- uma fonte vinculada (quando o cliente tem client_sources).
-- A RPC anterior não aceitava restrição por source_id; esta aceita.
-- Também aplica unaccent no texto da tsquery (ver migration 011).
-- ============================================================

-- Substitui a RPC existente: mesma assinatura antiga (3 args) continua
-- funcionando via default NULL em source_ids.
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
  -- Valida sintaxe da tsquery
  IF NOT noticias.validate_tsquery(tsquery_text) THEN
    IF fallback_to_simple THEN
      -- Fallback: extrai palavras e constrói AND simples
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

  -- Executa tsquery com unaccent (compatível com search_vector v11)
  -- source_ids NULL = sem restrição; array = restringe às fontes informadas
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
  'Retorna news.id que matcham a tsquery. Aplica unaccent. Se source_ids informado, restringe às fontes. fallback_to_simple reconstrói com AND de keywords em caso de sintaxe inválida.';
