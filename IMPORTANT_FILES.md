# 📁 Arquivos Importantes - Referência Rápida

## 📋 ARQUIVOS PARA SETUP (LEIA PRIMEIRO!)

### 1. **SETUP_INSTRUCTIONS.md** ⭐⭐⭐
   - Guia passo a passo completo
   - Como aplicar migrations no Supabase
   - Como configurar .env.local
   - Como testar endpoints
   - Troubleshooting

### 2. **APPLY_MIGRATIONS.sql** ⭐⭐⭐
   - Script SQL consolidado
   - Copie e cole no Supabase > SQL Editor
   - Cria todas as 4 migrations de uma vez

### 3. **FINAL_CHECKLIST.md**
   - Sumário de tudo que foi implementado
   - Próximas ações por você
   - Roadmap de deployment

---

## 🗂️ ESTRUTURA DO PROJETO

```
dash-noticias/
├── src/
│   ├── app/(app)/
│   │   ├── analista/page.tsx ⭐ Dashboard Analista
│   │   ├── account-manager/page.tsx ⭐ Dashboard Account Manager
│   │   └── estrategista/page.tsx ⭐ Dashboard Estrategista
│   │
│   ├── components/
│   │   ├── analista/
│   │   │   ├── search-filters.tsx (Filtros avançados)
│   │   │   ├── temporal-charts.tsx (Gráficos)
│   │   │   ├── export-menu.tsx (Exportação)
│   │   │   └── comparison-view.tsx (Comparação)
│   │   └── layout/
│   │       └── sidebar.tsx (Atualizado com roles)
│   │
│   ├── services/
│   │   ├── advanced-search.ts (Busca avançada)
│   │   ├── temporal-analysis.ts (Análise temporal)
│   │   ├── report-generator.ts (Relatórios)
│   │   ├── account-manager.ts (Account Manager logic)
│   │   ├── strategist-insights.ts (Insights globais)
│   │   ├── openai-nlp.ts (Extração de tópicos)
│   │   ├── topic-processor.ts (Processamento)
│   │   ├── crisis-detector.ts (Detecção de crises)
│   │   └── news-matcher.ts (Matching booleano)
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts (Browser client - USE ESTE!)
│   │   │   └── server.ts (Server client)
│   │   └── types/
│   │       └── database.ts (Tipos TypeScript)
│   │
│   └── app/api/
│       └── cron/
│           ├── fetch-feeds/ (RSS + NLP + Matching)
│           └── detect-crises/ (Detecção de crises)
│
├── supabase/migrations/
│   ├── 001_initial_schema.sql (Original)
│   ├── 006_news_topics.sql (Tópicos)
│   ├── 007_global_themes.sql (Temas + Crises)
│   ├── 008_client_themes.sql (Temas por cliente)
│   └── 009_role_expansion.sql (Roles)
│
├── netlify/functions/
│   └── fetch-feeds-scheduled.ts (Cron job a cada 30 min)
│
├── SETUP_INSTRUCTIONS.md ⭐ COMECE AQUI
├── APPLY_MIGRATIONS.sql ⭐ SQL PARA RODAR
├── FINAL_CHECKLIST.md
└── IMPORTANT_FILES.md (Este arquivo)
```

---

## 🔧 IMPORT CORRETO PARA SUPABASE CLIENT

**CORRETO (use isto):**
```typescript
import { createClient } from '@/lib/supabase/client'
```

**ERRADO (não use):**
```typescript
import { createClient } from '@/lib/supabase/browser'
```

---

## 📊 TABELAS DO BANCO DE DADOS

Após aplicar as migrations, estas tabelas devem existir:

### Schema `noticias`

#### Tabelas Originais (já existem)
- `sources` - Feeds RSS
- `news` - Notícias coletadas
- `clients` - Clientes
- `client_filters` - Filtros booleanos
- `client_news` - Matches (antigo)
- `user_clients` - Atribuição de clientes a usuários
- `user_profiles` - Usuários (role atualizado)
- `user_favorites` - Favoritos
- `user_read_news` - Notícias lidas
- `client_sources` - Fontes por cliente

#### Tabelas NOVAS (criar via migrations)
- `news_topics` - Tópicos extraídos do OpenAI
- `global_themes` - Temas consolidados globalmente
- `crisis_alerts` - Alertas de crise
- `client_themes` - Temas por cliente
- `client_theme_matches` - Notícias que matcharam com temas

---

## 🚀 ENDPOINTS DE API

### Processamento
- `GET /api/cron/fetch-feeds?cron_secret=XXX`
  - Fetch RSS + OpenAI NLP + Matching + Saving
  - Retorna: { feeds, totalInserted, matching, totalMatched, topicProcessing }

### Detecção de Crises
- `GET /api/cron/detect-crises?cron_secret=XXX`
  - Detecta crises para clientes + globais
  - Retorna: { clientCrises, globalCrises }

### Autenticação
- `Authorization: Bearer <CRON_SECRET>`
- Via query param: `?cron_secret=<value>`

---

## 🎨 COMPONENTES PRINCIPAIS

### Página: Dashboard Analista (`/analista`)
- **Tabs**: Search | Analysis | Comparison
- **Search**: Filtros avançados + ResultadosExportar
- **Analysis**: Gráficos temporais (volume, sentimento)
- **Comparison**: Comparar 2 clientes

### Página: Account Manager (`/account-manager`)
- **KPIs**: Clientes, crises ativas, críticas
- **Status**: Lista de clientes com alertas
- **History**: Timeline de últimas 24h

### Página: Estrategista (`/estrategista`)
- **KPIs**: Temas, crises, sentimento, recomendações
- **Top Themes**: Ranking de temas globais
- **Sentiment**: Gráfico de barras
- **Crises**: Alertas globais
- **Recommendations**: Oportunidades de campanha

---

## 🔑 VARIÁVEIS DE AMBIENTE (`.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=seu-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxx

# Security
CRON_SECRET=NoticiasListening2026
```

Encontre as chaves em:
- Supabase: Settings > API > Project URL / anon key / service_role key
- OpenAI: https://platform.openai.com/api-keys

---

## 🧪 COMO TESTAR

### 1. Testar API de Processamento
```bash
curl -H "Authorization: Bearer NoticiasListening2026" \
  http://localhost:3000/api/cron/fetch-feeds
```

### 2. Testar API de Crises
```bash
curl -H "Authorization: Bearer NoticiasListening2026" \
  http://localhost:3000/api/cron/detect-crises
```

### 3. Testar Dashboards
1. Abrir http://localhost:3000
2. Fazer login com Analyst/Account Manager/Strategist
3. Navegar para cada dashboard

---

## 📚 DOCUMENTAÇÃO NO MEMORY

Arquivos salvos em `C:\Users\rafas\.claude\projects\...\memory\`:
- `PLANNING_EXPANSION.md` - Estratégia completa
- `IMPLEMENTATION_STATUS.md` - Status de implementação
- `project_stack.md` - Stack tecnológico
- `project_structure.md` - Estrutura de pastas

---

## ⚠️ PROBLEMAS COMUNS

### "Module not found: @/lib/supabase/browser"
**Solução**: Use `@/lib/supabase/client` em vez disso

### "OPENAI_API_KEY is not defined"
**Solução**: Adicione em `.env.local`:
```
OPENAI_API_KEY=sk-xxxxxxxxxxxx
```

### "Table does not exist"
**Solução**: Verifique se rodou `APPLY_MIGRATIONS.sql` no Supabase

### "Unauthorized" no endpoint de API
**Solução**: Verifique se está passando `cron_secret` corretamente

---

## 🎯 PRÓXIMOS PASSOS

1. ✅ Ler `SETUP_INSTRUCTIONS.md`
2. ✅ Copiar e executar `APPLY_MIGRATIONS.sql`
3. ✅ Configurar `.env.local`
4. ✅ Rodar `npm run dev`
5. ✅ Testar endpoints `/api/cron/*`
6. ✅ Adicionar dados de teste (feeds RSS)
7. ✅ Testar os 3 dashboards

---

## 💬 Dúvidas?

Consulte:
1. `SETUP_INSTRUCTIONS.md` > TROUBLESHOOTING
2. Console do navegador (F12)
3. Logs do Supabase (Dashboard > Logs)
4. Memory files para contexto

**Bom luck! 🚀**
