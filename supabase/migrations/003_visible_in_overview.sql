-- Adicionar coluna visible_in_overview à tabela sources
-- Portais com visible_in_overview = false são excluídos da Visão Geral
-- mas continuam disponíveis para matching de clientes e Busca Global
ALTER TABLE noticias.sources
  ADD COLUMN visible_in_overview BOOLEAN NOT NULL DEFAULT true;

-- Ocultar portais regionais/específicos de clientes da Visão Geral
UPDATE noticias.sources
SET visible_in_overview = false
WHERE name IN (
  'G1 Rio Grande do Sul',
  'Correio do Povo',
  'Correio do Povo - Política',
  'Correio do Povo - Economia',
  'Sul21'
);

-- Limpar tsquery_value cacheados para forçar recompute com lógica corrigida de frases
UPDATE noticias.client_filters SET tsquery_value = NULL WHERE tsquery_value IS NOT NULL;

COMMENT ON COLUMN noticias.sources.visible_in_overview IS
  'Quando false, fonte e suas notícias são excluídas da Visão Geral. Busca Global e páginas de clientes não são afetadas.';
