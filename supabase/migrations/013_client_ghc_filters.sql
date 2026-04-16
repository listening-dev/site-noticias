-- ============================================================
-- 013 — Limpa client_news antigo do GHC (fire-hose)
-- ============================================================
-- Motivação: o GHC recebia todas as notícias das fontes vinculadas
-- sem passar pela booleana (comportamento antigo, pré-Y-estrito).
-- Esta migration apaga esses matches pra que o próximo cron/reprocesso
-- repopule aplicando a nova regra (booleana AND linked_sources).
--
-- Nota: uma versão anterior desta migration inseria 3 booleanas
-- de partida pro GHC, mas o cliente já tinha filtros mais bem
-- calibrados cadastrados manualmente ("Dirigentes GHC", "Instituições
-- GHC", "Unidades GHC"). Inserts removidos em 2026-04-16.
-- ============================================================

DELETE FROM noticias.client_news
WHERE client_id = (
  SELECT id FROM noticias.clients WHERE name = 'Grupo Hospitalar Conceição (GHC)'
);
