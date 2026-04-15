# 🚀 Instruções de Setup - Dash Notícias Expansão

## PASSO 1: Aplicar Migrations no Supabase

### 1.1 Abrir SQL Editor do Supabase
1. Vá para: https://app.supabase.com/
2. Selecione seu projeto
3. Clique em **SQL Editor** (sidebar esquerda)
4. Clique em **+ New Query**

### 1.2 Colar o Script SQL
1. Abra o arquivo `APPLY_MIGRATIONS.sql` neste repositório
2. **Copie TODO o conteúdo**
3. **Cole** no SQL Editor do Supabase
4. Clique em **Run** (botão azul no canto superior direito)

### 1.3 Verificar Execução
- Se vir **✅ "No errors"**, sucesso!
- Se houver erro, vá para a seção "Troubleshooting" abaixo

---

## PASSO 2: Verificar Tabelas Criadas

No Supabase, vá para **Table Editor** (sidebar):

Deve aparecer:
- ✅ `news_topics`
- ✅ `global_themes`
- ✅ `crisis_alerts`
- ✅ `client_themes`
- ✅ `client_theme_matches`

---

## PASSO 3: Verificar Variáveis de Ambiente

No arquivo `.env.local` (criar se não existir), adicionar:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
OPENAI_API_KEY=sk-xxxxxxxxxxxx
CRON_SECRET=NoticiasListening2026
```

⚠️ **Encontre essas chaves em:**
- **Supabase URL + ANON KEY**: Settings > API > Project URL e anon key
- **SERVICE_ROLE_KEY**: Settings > API > service_role key
- **OPENAI_API_KEY**: https://platform.openai.com/api-keys

---

## PASSO 4: Testar Endpoints de API

### 4.1 Testar `/api/cron/fetch-feeds`

Abra no navegador:
```
http://localhost:3000/api/cron/fetch-feeds?cron_secret=NoticiasListening2026
```

Ou via curl:
```bash
curl -H "Authorization: Bearer NoticiasListening2026" \
  http://localhost:3000/api/cron/fetch-feeds
```

Esperado: JSON com resultado de feeds + topics + matching

### 4.2 Testar `/api/cron/detect-crises`

```bash
curl -H "Authorization: Bearer NoticiasListening2026" \
  http://localhost:3000/api/cron/detect-crises
```

Esperado: JSON com crises detectadas

---

## PASSO 5: Testar Dashboards

### 5.1 Criar usuários de teste

1. Vá para **Authentication** no Supabase
2. Clique em **Add User**
3. Crie 3 usuários:
   - `analyst@example.com` (role: analyst)
   - `account_manager@example.com` (role: account_manager)
   - `strategist@example.com` (role: strategist)

### 5.2 Atualizar roles

No **SQL Editor**, execute:

```sql
UPDATE noticias.user_profiles 
SET role = 'analyst' 
WHERE email = 'analyst@example.com';

UPDATE noticias.user_profiles 
SET role = 'account_manager' 
WHERE email = 'account_manager@example.com';

UPDATE noticias.user_profiles 
SET role = 'strategist' 
WHERE email = 'strategist@example.com';
```

### 5.3 Assignar clientes (para Account Manager)

No **SQL Editor**, execute:

```sql
-- Pegar ID de um cliente e usuário
INSERT INTO noticias.user_clients (user_id, client_id)
SELECT u.id, c.id
FROM noticias.user_profiles u, noticias.clients c
WHERE u.email = 'account_manager@example.com'
LIMIT 1;
```

### 5.4 Rodar aplicação

```bash
npm run dev
```

Acesse: http://localhost:3000

Login com as 3 contas de teste e verifique:
- ✅ Analyst vê: Dashboard Análise + Busca Avançada
- ✅ Account Manager vê: Meus Clientes + alertas
- ✅ Strategist vê: Insights Globais

---

## TROUBLESHOOTING

### "Error: Permission denied" no SQL Editor
**Causa**: Usuário não tem permissões de admin
**Solução**: Use sua conta da organização Supabase (a que criou o projeto)

### "Table already exists"
**Causa**: Migrations já foram aplicadas antes
**Solução**: Pode ignorar ou dropar as tabelas antes:
```sql
DROP TABLE IF EXISTS noticias.news_topics CASCADE;
DROP TABLE IF EXISTS noticias.global_themes CASCADE;
DROP TABLE IF EXISTS noticias.crisis_alerts CASCADE;
DROP TABLE IF EXISTS noticias.client_themes CASCADE;
DROP TABLE IF EXISTS noticias.client_theme_matches CASCADE;
```

### "OpenAI API Key invalid"
**Solução**: Verifique em https://platform.openai.com/api-keys se a chave está correta

### Dashboards vazios (sem dados)
**Causa**: Ainda não há notícias processadas
**Solução**:
1. Certifique-se que feed RSS foi adicionado em `noticias.sources`
2. Rode manualmente: `/api/cron/fetch-feeds`
3. Aguarde alguns segundos
4. Recarregue a página

---

## CHECKLIST FINAL

- [ ] Migrations aplicadas no Supabase (APPLY_MIGRATIONS.sql)
- [ ] Variáveis de ambiente em `.env.local`
- [ ] Tabelas criadas (verificado em Table Editor)
- [ ] Usuários de teste criados (3 contas com roles diferentes)
- [ ] Clientes assignados ao Account Manager
- [ ] Endpoints `/api/cron/*` testados manualmente
- [ ] `npm run dev` rodando sem erros
- [ ] Consegue fazer login nos 3 dashboards

---

## 📊 Próximos Passos

1. **Testar com dados reais**
   - Adicionar feed RSS em `noticias.sources`
   - Rodar `/api/cron/fetch-feeds`

2. **Implementar aba de Comparação** (se necessário)
   - Dashboard Analista > Comparação
   - Comparar 2 clientes lado a lado

3. **Configurar Netlify Function**
   - Verificar se `netlify/functions/fetch-feeds-scheduled.ts` está rodando
   - Aumentar frequência se necessário

---

## 💬 Dúvidas?

Qualquer erro durante o setup, reporte a mensagem exata de erro.
