-- Criar cliente MDA (Ministério do Desenvolvimento Agrário)
DO $$
DECLARE
  v_client_id UUID;
BEGIN
  INSERT INTO noticias.clients (id, name, description)
  VALUES (gen_random_uuid(), 'MDA', 'Ministério do Desenvolvimento Agrário e Agricultura Familiar')
  RETURNING id INTO v_client_id;

  -- Filtro 1: Termos centrais MDA
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'Termos centrais MDA',
    '"Ministério do Desenvolvimento Agrário" OR "ministra Fernanda Machiaveli" OR "ministra do desenvolvimento agrário" OR "Fernanda Machiaveli" OR MDAAF',
    true);

  -- Filtro 2: Programas e políticas agrárias
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'Programas e políticas',
    '"Reforma Agrária" OR "Programa Terra da Gente" OR "Terra da Gente" OR Pronaf OR "Crédito rural" OR "Programa Nacional de Crédito Fundiário" OR "Programa Mais Alimentos" OR Pronera OR "Programa de Aquisição de Alimentos" OR "Abril Vermelho"',
    true);

  -- Filtro 3: PNAE e alimentação escolar + agricultura familiar
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'Alimentação escolar + agricultura',
    '("Programa Nacional de Alimentação Escolar" OR PNAE OR "alimentação escolar") AND ("agricultura familiar" OR "agricultor familiar" OR "pequenos produtores")',
    true);

  -- Filtro 4: CAF - Cadastro Nacional da Agricultura Familiar
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'CAF agricultura familiar',
    'CAF AND ("Cadastro Nacional da Agricultura Familiar" OR "agricultor familiar" OR "agricultura familiar")',
    true);

  -- Filtro 5: MDA + temas de sustentabilidade e comunidades
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'MDA + sustentabilidade e comunidades',
    '("Ministério do Desenvolvimento Agrário" OR MDA OR "Fernanda Machiaveli" OR MST OR "agricultura familiar") AND ("Quintais Produtivos" OR "Plano de Aceleração de Soluções" OR agroecologia OR "Povos tradicionais" OR "Comunidades indígenas" OR assentamentos OR quilombolas OR "Mulheres rurais" OR "Juventude rural" OR "regularização fundiária" OR bioinsumos OR "soberania alimentar" OR "produção orgânica" OR "Assistência técnica" OR "Titulação de terras" OR "transição agroecológica")',
    true);

  -- Filtro 6: Conflitos agrários e mediação
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'Conflitos agrários e mediação',
    '"Mediação de conflitos agrários" OR "Violência agrária" OR "Conflitos no campo" OR "Ouvidoria Agrária Nacional" OR "Departamento de Mediação e Conciliação de Conflitos Agrários"',
    true);

  -- Filtro 7: Feiras e eventos agropecuários
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'Feiras e eventos',
    '"Feira da Reforma Agrária" OR Agrishow OR "Feira da Agricultura Familiar" OR Expointer OR "Feira Nacional da Reforma Agrária" OR "Feira da Agroecologia" OR "ExpoCannabis Brasil"',
    true);

  -- Filtro 8: MST e movimentos sociais do campo
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'MST e movimentos sociais',
    '"Movimento dos Trabalhadores Rurais Sem Terra" OR "invasão de terra" OR "Invasão Zero" OR "Ocupações do MST" OR "Assentados da reforma agrária" OR "desapropriação de terras"',
    true);

  -- Filtro 9: Lideranças MST
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'Lideranças MST',
    '("João Paulo" OR "João Pedro" OR "Jaime Amorim" OR "Diego Amorim") AND (MST OR "reforma agrária" OR agricultura)',
    true);

  -- Filtro 10: Órgãos vinculados ao MDA
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'Órgãos vinculados',
    'Incra OR Ceagesp OR Conab OR Anater OR Ceasaminas OR Conafer OR Contag OR Dater OR MST',
    true);

  -- Filtro 11: Via Campesina
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'Via Campesina',
    '"Via Campesina" AND ("reforma agrária" OR "soberania alimentar" OR MST OR "mulheres camponesas" OR "pequenos produtores")',
    true);

  -- Filtro 12: Frente Parlamentar da Agropecuária + MDA
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'Bancada ruralista + MDA',
    '("Frente Parlamentar da Agropecuária" OR "bancada ruralista" OR FPA) AND ("desenvolvimento agrário" OR MDA OR MST OR "invasão de terra" OR "Fernanda Machiaveli")',
    true);

  -- Filtro 13: COP30 + agricultura
  INSERT INTO noticias.client_filters (id, client_id, label, boolean_query, active)
  VALUES (gen_random_uuid(), v_client_id, 'COP30 + agricultura',
    '(COP30 OR "COP 30" OR "Conferência das Nações Unidas sobre as Mudanças Climáticas") AND ("Ministério do Desenvolvimento Agrário" OR MDA OR "Fernanda Machiaveli" OR MST OR "agricultura familiar")',
    true);

  RAISE NOTICE 'Cliente MDA criado com ID: %', v_client_id;
END $$;
