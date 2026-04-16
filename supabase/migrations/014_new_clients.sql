-- ============================================================
-- 014 — Cadastro de 5 novos clientes
-- ============================================================
-- Clientes: CFQ, Rivio, MIDR, Polvolab, FENINFRA
--
-- Cada booleana do usuário foi quebrada em múltiplos filtros
-- nomeados por tema, facilitando (i) desativação granular de
-- pedaços ruidosos e (ii) identificação na UI "Filtro: {label}".
--
-- Sintaxes quebradas removidas: author:cfquimica (CFQ), NEAR/3
-- (Rivio) e #polvolab (Polvolab) — nosso parser de booleana só
-- suporta AND/OR/NOT + frases em aspas duplas.
--
-- Filtros potencialmente muito amplos foram marcados active=false
-- pra serem ativados manualmente depois de validar o preview.
-- ============================================================

BEGIN;

-- ============================================================
-- CFQ — Conselho Federal de Química
-- ============================================================
DO $$
DECLARE v_client_id UUID;
BEGIN
  INSERT INTO noticias.clients (id, name, description)
  VALUES (gen_random_uuid(), 'CFQ', 'Conselho Federal de Química')
  RETURNING id INTO v_client_id;

  INSERT INTO noticias.client_filters (client_id, label, boolean_query, active) VALUES
  (v_client_id, 'Conselhos profissionais',
   $bq$"Conselho Federal dos Técnicos Industriais" OR "Conselho Regional dos Técnicos Industriais" OR "Conselho Federal dos Tecnicos Industriais" OR "Conselho Regional dos Tecnicos Industriais" OR "CFTBrasil" OR "Sistema CFT" OR "Conselho Federal de Química" OR "Conselho Regional de Química"$bq$,
   true),
  (v_client_id, 'Química em setores energéticos',
   $bq$Química AND (biocombustíveis OR biocombustível OR petróleo OR gás)$bq$,
   true),
  (v_client_id, 'Indústria química',
   $bq$"Indústria Química" OR "Indústria Bioquímica" OR "Indústria Petroquímica" OR "Regime Especial da Indústria Química" OR "Empresa Química" OR "Fábrica Química"$bq$,
   true),
  (v_client_id, 'Academia química',
   $bq$"Instituto de Química" OR "Departamento de Química" OR "Instituto de Bioquímica" OR "Departamento de Bioquímica"$bq$,
   true),
  (v_client_id, 'Responsável técnico química',
   $bq$Química AND "Responsável Técnico"$bq$,
   true),
  (v_client_id, 'Agroquímicos',
   $bq$Química AND (Agroquímico OR Agrotóxicos OR "defensivo agrícola")$bq$,
   true),
  (v_client_id, 'Produtos químicos',
   $bq$"Produtos Químicos" OR "Produto Químico" OR "Elementos Químicos" OR Farmoquímica OR Farmoquímico$bq$,
   true),
  (v_client_id, 'Química + elementos',
   $bq$Química AND (Hidrogênio OR Mercúrio OR Cobalto OR Enxofre OR Fósforo)$bq$,
   true),
  (v_client_id, 'Associações setoriais química',
   $bq$Química AND (SINQUISP OR ABIQUIM OR ABIFINA OR ABQCT OR Associquim OR Sincoquim OR "Associação Brasileira de Engenharia Química" OR "frente parlamentar da química")$bq$,
   true),
  (v_client_id, 'Acidentes com cloro em piscina',
   $bq$(piscina AND cloro) AND (morte OR morreu OR óbito OR intoxicação OR intoxicada OR "gás cloro" OR inalação)$bq$,
   true);
END $$;

-- ============================================================
-- Rivio
-- ============================================================
DO $$
DECLARE v_client_id UUID;
BEGIN
  INSERT INTO noticias.clients (id, name, description)
  VALUES (gen_random_uuid(), 'Rivio', 'Healthtech — plataforma de ciclo de receita hospitalar')
  RETURNING id INTO v_client_id;

  INSERT INTO noticias.client_filters (client_id, label, boolean_query, active) VALUES
  (v_client_id, 'Marca Rivio + contexto',
   $bq$Rivio AND (healthtech OR hospital OR hospitais OR "inteligência artificial" OR "ciclo de receita" OR "faturamento hospitalar" OR glosa OR glosas OR "receita hospitalar" OR startup OR scaleup OR unicórnio OR "IA generativa" OR SaaS OR B2B OR "agentes de IA" OR "São Paulo" OR Blumenau OR "Congresso de Inovação" OR "Auditoria em Saúde" OR "evento de healthtech")$bq$,
   true),
  (v_client_id, 'Lideranças Rivio',
   $bq$("Ricardo Sales" OR "Silvio Frison" OR "Ricardo Stefanelli" OR "Bruno Brasil") AND Rivio$bq$,
   true),
  (v_client_id, 'Investidores Rivio',
   $bq$("Valor Capital" OR Monashees OR "Endeavor Catalyst") AND Rivio$bq$,
   true),
  (v_client_id, 'Concorrência hospitais privados',
   $bq$Anahp OR "Associação Nacional de Hospitais Privados" OR "Hospital Oswaldo Cruz" OR "Hospital Sírio Libanês" OR "Hospital Albert Einstein" OR "Rede D'Or" OR "Beneficência Portuguesa de São Paulo" OR "A.C.Camargo Cancer Center"$bq$,
   false),
  (v_client_id, 'IA + saúde (contexto amplo)',
   $bq$("inteligência artificial" AND saúde) OR ("startups de IA" AND saúde) OR ("IA generativa" AND saúde) OR ("Eficiência operacional" AND (hospital OR saúde)) OR ("Agentes de IA" AND saúde) OR ("Sustentabilidade financeira" AND hospital)$bq$,
   false);
END $$;

-- ============================================================
-- MIDR — Ministério da Integração e do Desenvolvimento Regional
-- ============================================================
DO $$
DECLARE v_client_id UUID;
BEGIN
  INSERT INTO noticias.clients (id, name, description)
  VALUES (gen_random_uuid(), 'MIDR', 'Ministério da Integração e do Desenvolvimento Regional')
  RETURNING id INTO v_client_id;

  INSERT INTO noticias.client_filters (client_id, label, boolean_query, active) VALUES
  (v_client_id, 'Ministério e liderança MIDR',
   $bq$"Ministerio da Integracao e do Desenvolvimento Regional" OR MIDR OR MDR OR "Ministro Waldez Goes" OR "Waldez Goes"$bq$,
   true),
  (v_client_id, 'Secretarias e dirigentes',
   $bq$"Secretaria Nacional de Seguranca Hidrica" OR "Secretaria Nacional de Politicas de Desenvolvimento Regional e Territorial" OR "Adriana Melo Alves" OR "Secretaria Nacional de Fundos e Instrumentos Financeiros" OR "Eduardo Correa Tavares" OR "Valder Ribeiro de Moura" OR "Secretaria Nacional de Protecao e Defesa Civil" OR "Wolnei Wolff" OR "Giuseppe Vieira"$bq$,
   true),
  (v_client_id, 'Programas de água',
   $bq$"Programa Agua Doce" OR "Programa Agua para Todos" OR "Adutora do Agreste" OR "Adutora da Fe" OR "Caminho das Aguas" OR "Caminho das Águas" OR "Cinturao das Aguas do Ceara" OR "Cinturão das Águas" OR "Seguranca Hidrica" OR "Eixo Agua para Todos"$bq$,
   true),
  (v_client_id, 'Transposição São Francisco',
   $bq$"Transposicao do Rio Sao Francisco" OR "Projeto Integracao do Rio Sao Francisco" OR PISF OR "Canal do Xingo" OR "Estacao de Bombeamento da Transposicao do Rio Sao Francisco" OR "EBI 3"$bq$,
   true),
  (v_client_id, 'Barragens e obras',
   $bq$"Barragem de Jati" OR "Barragem de Oiticica" OR "Seguranca de Barragens" OR "Projeto Serido" OR "Baixio do Irece" OR "Canal do Sertao Alagoano" OR "Canal do Sertao Baiano" OR "Ramal do Agreste" OR "Ramal do Apodi" OR "Ramal do Salgado" OR "Revitalizacao de Bacias Hidrograficas" OR "Vertentes Litoraneas"$bq$,
   true),
  (v_client_id, 'Amazônia e desenvolvimento regional',
   $bq$Amazonia OR "Amazonia Azul" OR "Amazonia Investimentos" OR "Amazonia Desenvolvimento" OR "Desenvolve Amazonia" OR "Consorcio da Amazonia" OR "Margem Equatorial" OR "Programa Calha Norte" OR Sudam OR "Superintendencia do Desenvolvimento da Amazonia" OR Sudeco OR "Superintendencia do Desenvolvimento do Centro-Oeste" OR Sudene OR "Superintendencia do Desenvolvimento do Nordeste" OR "Plano de Desenvolvimento Regional" OR "Rotas de Integracao Nacional"$bq$,
   true),
  (v_client_id, 'Créditos e fundos',
   $bq$Agroamigo OR Credamigo OR Codevasf OR "Companhia de Desenvolvimento dos Vales do Sao Francisco e do Parnaiba" OR "Fundo de Apoio a Estruturacao de Projetos de Concessao e Parcerias"$bq$,
   true),
  (v_client_id, 'Defesa Civil e emergência',
   $bq$"Defesa Civil Nacional" OR "Defesa Civil Alerta" OR "Operacao Carro Pipa" OR "Auxilio Reconstrucao" OR "Sistema de Cell Broadcast" OR "cell broadcast" OR DNOCS OR "Departamento Nacional de Obras Contra as Secas"$bq$,
   true),
  (v_client_id, 'Saneamento e hidrografia',
   $bq$"Agencia Nacional de Aguas e Saneamento Basico" OR "Sistema Nacional de Informacoes sobre Saneamento" OR Transnordestina$bq$,
   true),
  (v_client_id, 'Orçamento e PAC',
   $bq$"Orcamento Secreto" OR "Novo PAC"$bq$,
   true),
  (v_client_id, 'Lula / Comitiva + Caminho das Águas',
   $bq$(Comitiva OR Lula OR Transposicao OR "Governo Federal") AND "Caminho das Aguas"$bq$,
   true);
END $$;

-- ============================================================
-- Polvolab
-- ============================================================
DO $$
DECLARE v_client_id UUID;
BEGIN
  INSERT INTO noticias.clients (id, name, description)
  VALUES (gen_random_uuid(), 'Polvolab', 'Marca Polvo Lab — alimentos e produtos Mesmo')
  RETURNING id INTO v_client_id;

  INSERT INTO noticias.client_filters (client_id, label, boolean_query, active) VALUES
  (v_client_id, 'Marca e pessoas',
   $bq$"Polvo Lab" OR PolvoLab OR "Ana Maria Diniz" OR "Gabi Marques"$bq$,
   true),
  (v_client_id, 'Produtos Mesmo',
   $bq$"Mel Mesmo" OR "Licuri Mesmo" OR "Tapioca Mesmo" OR "Cacau Mesmo" OR "Flocão de Milho Mesmo" OR "Castanha Mesmo"$bq$,
   true);
END $$;

-- ============================================================
-- FENINFRA — Federação Nacional das Empresas de Telecomunicações
-- ============================================================
DO $$
DECLARE v_client_id UUID;
BEGIN
  INSERT INTO noticias.clients (id, name, description)
  VALUES (gen_random_uuid(), 'FENINFRA', 'Federação Nacional das Empresas de Telecomunicações do Brasil')
  RETURNING id INTO v_client_id;

  INSERT INTO noticias.client_filters (client_id, label, boolean_query, active) VALUES
  (v_client_id, 'Marca FENINFRA e liderança',
   $bq$FENINFRA OR "Federação Nacional de Call Center" OR "Vivien Suruagy" OR "Vivien M. Suruagy" OR "Vivien Melo Suruagy" OR "Federação Nacional das Empresas de Telecomunicações do Brasil"$bq$,
   true),
  (v_client_id, 'Escala 6x1 + associações',
   $bq$("escala 6x1" OR "jornada 6x1" OR 6x1) AND (CACB OR CCJ OR Fiems OR CNI OR "Confederação Nacional da Indústria")$bq$,
   true),
  (v_client_id, 'Governo + IA/5G (contexto amplo)',
   $bq$governo AND federal AND (hub OR investimento OR investir) AND ("inteligência artificial" OR dados OR 5G OR 4G)$bq$,
   false);
END $$;

COMMIT;

-- ============================================================
-- VERIFY
-- ============================================================
SELECT c.name, COUNT(*) FILTER (WHERE f.active) AS ativos, COUNT(*) AS total
FROM noticias.clients c
LEFT JOIN noticias.client_filters f ON f.client_id = c.id
WHERE c.name IN ('CFQ', 'Rivio', 'MIDR', 'Polvolab', 'FENINFRA')
GROUP BY c.name
ORDER BY c.name;
