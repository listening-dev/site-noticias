# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-04-11] Read Next.js docs in node_modules before writing code**
   Do instead: check `node_modules/next/dist/docs/` for current API conventions before any Next.js code change.

## Shell & Command Reliability
1. **[2026-04-11] Windows paths with spaces need quoting**
   Do instead: always use double quotes around paths containing "Área de Trabalho".

## Domain Behavior Guardrails
1. **[2026-04-11] Supabase schema is `noticias`, not `public`**
   Do instead: always specify schema when querying Supabase tables.

## Arquitetura & NLP (2026-04-15)
1. **[2026-04-15] OpenAI integrado para extração de tópicos**
   Do instead: Use `openai-nlp.ts` para extrair topics, entities, sentiment. Pipeline de cron chama `topic-processor.ts` a cada 30 min.

2. **[2026-04-15] Detecção de crises automática**
   Do instead: `crisis-detector.ts` detecta quando #matches > threshold. Endpoints: `/api/cron/detect-crises` chamado a cada 30 min.

3. **[2026-04-15] 3 Personas com dashboards distintos**
   Do instead: Analista > Account Manager > Estrategista. Cada um vê dados diferentes. Sidebar mostra links por role.

## Security & Database Patterns
1. **[2026-04-15] Views que retornam dados de usuários devem ser funções SECURITY DEFINER com RLS**
   Do instead: Nunca use GRANT SELECT TO authenticated em views com dados sensíveis. Use funções que filtram por auth.uid().

## JSONB & tsquery Fixes — IMPLEMENTED (2026-04-15)
1. **[2026-04-15] Bug #1 FIXED: JSONB full-scan replaced with denormalized topic_mentions**
   Do instead: All queries now use topic_mentions with O(log n) index hits. Fixed in: advanced-search.ts (topicNames filter), searchByTheme(), strategist-insights.ts getTopGlobalThemes().

2. **[2026-04-15] Bug #2 FIXED: tsquery validation + safe RPC**
   Do instead: jsonb-search.ts calls match_news_by_tsquery_safe RPC with fallback_to_simple=true. validateTsquery() validates syntax before sending. Prevents crashes from malformed queries.

3. **[2026-04-15] Bug #3 FIXED: Crisis detection now searches by theme.name**
   Do instead: crisis-detector.ts detectGlobalCrises() uses countRecentTopicMentions(theme.name) from topic-search.ts. Queries denormalized topic_mentions table. Alerts trigger correctly.

## OpenAI & Resilience (2026-04-16)
1. **[2026-04-16] Candidate 7 DONE: Design B (Resilience Wrapper) implemented**
   Do instead: Use extractTopicsWithResilient() for explicit control. extractTopicsFromNews() now has automatic retries, dedup, token tracking via wrapper. Config in .env.local: OPENAI_MAX_RETRIES, OPENAI_ENABLE_DEDUP, OPENAI_TOKEN_BUDGET_DAILY. See DESIGN_B_IMPLEMENTATION.md.

## User Directives
