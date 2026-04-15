-- ============================================================
-- FIX: Remove view insegura e usa função segura no lugar
-- ============================================================

-- 1. Remover a view antiga se existir
DROP VIEW IF EXISTS noticias.user_role_info CASCADE;

-- 2. Remover função antiga se existir
DROP FUNCTION IF EXISTS noticias.get_current_user_role() CASCADE;

-- 3. Criar função segura que retorna APENAS dados do usuário autenticado
CREATE FUNCTION noticias.get_current_user_role()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  role_label TEXT,
  access_level TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = noticias, public
AS $$
SELECT
  id,
  email,
  full_name,
  role,
  CASE role
    WHEN 'admin' THEN 'Administrador'
    WHEN 'analyst' THEN 'Analista de Mídia'
    WHEN 'account_manager' THEN 'Account Manager'
    WHEN 'strategist' THEN 'Estrategista'
  END AS role_label,
  CASE role
    WHEN 'admin' THEN 'full'
    WHEN 'analyst' THEN 'analyst'
    WHEN 'account_manager' THEN 'account_manager'
    WHEN 'strategist' THEN 'strategist'
  END AS access_level
FROM noticias.user_profiles
WHERE id = auth.uid();
$$;

-- 4. Dar permissão só para usuários autenticados executarem
GRANT EXECUTE ON FUNCTION noticias.get_current_user_role() TO authenticated;

-- ============================================================
-- ✅ SEGURANÇA CORRIGIDA!
-- A view pública foi removida. Agora temos apenas uma função
-- que retorna dados APENAS do usuário autenticado.
-- ============================================================
