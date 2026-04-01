-- Seed: Fontes RSS ativas
-- Executar APÓS a migration 001_initial_schema.sql

-- 1. Desativar fontes com URLs inativas ou removidas
UPDATE noticias.sources SET active = false
WHERE name IN (
  'G1 - Tecnologia',
  'G1 - Economia',
  'G1 - Política',
  'UOL Notícias',
  'Estadão',
  'Correio Braziliense',
  'Metrópoles',
  'R7',
  'GZH',
  'Correio do Povo',
  'Correio do Povo - Política',
  'Correio do Povo - Economia',
  'UOL Notícias',
  'UOL Economia'
);

-- 2. Inserir/reativar fontes com URLs corretas
INSERT INTO noticias.sources (name, rss_url, category) VALUES
  -- Portais nacionais gerais
  ('G1 - Geral',         'https://g1.globo.com/rss/g1/',                                          'geral'),
  ('Folha de S.Paulo',   'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml',                'geral'),
  ('CNN Brasil',         'https://www.cnnbrasil.com.br/feed/',                                    'geral'),
  ('BBC Brasil',         'https://www.bbc.com/portuguese/index.xml',                              'geral'),
  ('Veja',               'https://veja.abril.com.br/feed/',                                       'geral'),

  -- Política
  ('Poder360',           'https://www.poder360.com.br/feed/',                                     'política'),
  ('Jornal de Brasília', 'https://jornaldebrasilia.com.br/feed/',                                 'geral'),

  -- Economia
  ('Valor Econômico',    'https://pox.globo.com/rss/valor/',                                      'economia'),


  -- Estadão por seção
  ('Estadão - Brasil',   'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/brasil/',   'geral'),
  ('Estadão - Política', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/', 'política'),
  ('Estadão - Economia', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/economia/', 'economia'),
  ('Estadão - Saúde',    'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/saude/',    'saúde'),

  -- G1 Rio Grande do Sul (cobertura regional — essencial para clientes RS)
  ('G1 Rio Grande do Sul', 'https://g1.globo.com/rss/g1/rs/rio-grande-do-sul/', 'regional')

ON CONFLICT (rss_url) DO UPDATE
  SET active = true,
      name = EXCLUDED.name,
      category = EXCLUDED.category;
