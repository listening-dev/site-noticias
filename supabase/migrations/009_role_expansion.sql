-- ============================================================
-- Expansão de roles para suportar 3 personas
-- ============================================================

-- Alterar constraint de role em user_profiles para incluir account_manager e strategist
ALTER TABLE noticias.user_profiles DROP CONSTRAINT user_profiles_role_check;

ALTER TABLE noticias.user_profiles
ADD CONSTRAINT user_profiles_role_check
CHECK (role IN ('admin', 'analyst', 'account_manager', 'strategist'));

-- Adicionar coluna de timestamp para atualizar
ALTER TABLE noticias.user_profiles
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- View auxiliar para mapear personas a permissões
-- (Ajuda no código a controlar o que cada role vê)
-- ============================================================

CREATE OR REPLACE VIEW noticias.user_role_info AS
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
FROM noticias.user_profiles;

-- RLS para view
ALTER VIEW noticias.user_role_info OWNER TO postgres;
GRANT SELECT ON noticias.user_role_info TO authenticated;
