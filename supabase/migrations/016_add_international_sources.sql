-- Migration 016: Adiciona fontes internacionais e brasileiras
-- (tecnologia, saúde, negócios, finanças)

INSERT INTO noticias.sources (name, rss_url, category) VALUES
  -- Tecnologia / Inovação
  ('TechCrunch',                        'https://techcrunch.com/feed/',                                  'tecnologia'),
  ('Fast Company Brasil',               'https://fastcompanybrasil.com/feed/',                           'tecnologia'),
  ('IA Brasil Notícias',                'https://iabrasilnoticias.com.br/feed/',                         'tecnologia'),

  -- Saúde (internacional)
  ('Fierce Healthcare',                 'https://www.fiercehealthcare.com/rss/xml',                      'saúde'),
  ('Fierce Healthcare - Providers',     'https://www.fiercehealthcare.com/rss/providers/xml',            'saúde'),
  ('Fierce Healthcare - Health Tech',   'https://www.fiercehealthcare.com/rss/health%26tech/xml',        'saúde'),
  ('Fierce Healthcare - Finance',       'https://www.fiercehealthcare.com/rss/finance/xml',              'saúde'),
  ('Fierce Healthcare - Payers',        'https://www.fiercehealthcare.com/rss/payers/xml',               'saúde'),
  ('Fierce Healthcare - Regulatory',    'https://www.fiercehealthcare.com/rss/regulatory/xml',           'saúde'),
  ('MedCity News',                      'https://medcitynews.com/feed/',                                 'saúde'),

  -- Saúde (Brasil)
  ('Hospitais Brasil',                  'https://portalhospitaisbrasil.com.br/feed/',                    'saúde'),
  ('Medicina S/A',                      'https://medicinasa.com.br/feed/',                               'saúde'),
  ('Saúde Business',                    'https://www.saudebusiness.com/feed/',                           'saúde'),

  -- Negócios / Finanças (Brasil)
  ('NeoFeed',                           'https://neofeed.com.br/feed/',                                  'economia'),
  ('Brazil Journal',                    'https://braziljournal.com/feed/',                               'economia'),
  ('InfoMoney',                         'https://www.infomoney.com.br/ultimas-noticias/feed/',           'economia'),
  ('InvestNews',                        'https://investnews.com.br/feed/',                               'economia')

ON CONFLICT (rss_url) DO UPDATE
  SET active = true,
      name   = EXCLUDED.name,
      category = EXCLUDED.category;
