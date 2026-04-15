-- Tabela de fontes vinculadas a clientes
-- Notícias dessas fontes aparecem automaticamente na página do cliente
CREATE TABLE noticias.client_sources (
  client_id UUID REFERENCES noticias.clients(id) ON DELETE CASCADE,
  source_id UUID REFERENCES noticias.sources(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, source_id)
);

ALTER TABLE noticias.client_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view client sources" ON noticias.client_sources FOR SELECT
USING (
  EXISTS (SELECT 1 FROM noticias.user_clients uc WHERE uc.client_id = client_sources.client_id AND uc.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM noticias.user_profiles up WHERE up.id = auth.uid() AND up.role = 'admin')
);

-- Vincular fontes do Sul ao GHC
INSERT INTO noticias.client_sources (client_id, source_id)
SELECT c.id, s.id
FROM noticias.clients c, noticias.sources s
WHERE c.name = 'Grupo Hospitalar Conceição (GHC)'
  AND s.name IN ('G1 Rio Grande do Sul', 'Correio do Povo', 'Correio do Povo - Política', 'Correio do Povo - Economia', 'Sul21');

-- Fix filtro 10 do MDA: remover termos genéricos (Contag, Dater, Cobab, MST já coberto em outro filtro)
UPDATE noticias.client_filters
SET boolean_query = '"Instituto Nacional de Colonização e Reforma Agrária" OR Incra OR Ceagesp OR Conab OR Anater OR Ceasaminas OR Conafer'
WHERE label = 'Órgãos vinculados'
  AND client_id = (SELECT id FROM noticias.clients WHERE name = 'MDA');

-- Limpar matches antigos do MDA para re-matchear com filtros corrigidos
DELETE FROM noticias.client_news WHERE client_id = (SELECT id FROM noticias.clients WHERE name = 'MDA');
