-- Adiciona suporte a keyword chips por cliente (ex: chip "Rivio" na aba da Rivio)
ALTER TABLE noticias.clients
  ADD COLUMN IF NOT EXISTS keyword_chips text[] DEFAULT '{}';

-- Popula keyword_chips para o cliente Rivio
UPDATE noticias.clients
SET keyword_chips = ARRAY['Rivio']
WHERE name ILIKE '%rivio%';

-- Corrige categoria da fonte "IA Brasil Notícias" de 'tecnologia' para 'inteligencia_artificial'
UPDATE noticias.sources
SET category = 'inteligencia_artificial'
WHERE name = 'IA Brasil Notícias';
