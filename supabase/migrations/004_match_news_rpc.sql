-- RPC function para buscar notícias usando to_tsquery diretamente
-- Isso permite uso de operadores avançados como <-> (phrase), &, |, !
CREATE OR REPLACE FUNCTION noticias.match_news_by_tsquery(
  tsquery_text TEXT,
  since_date TIMESTAMPTZ
)
RETURNS TABLE(id UUID) AS $$
BEGIN
  RETURN QUERY
    SELECT n.id
    FROM noticias.news n
    WHERE n.published_at >= since_date
      AND n.search_vector @@ to_tsquery('portuguese', tsquery_text);
END;
$$ LANGUAGE plpgsql STABLE;
