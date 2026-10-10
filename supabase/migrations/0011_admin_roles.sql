-- FASE 20: Admin Roles y Permisos

-- Enum para roles de administración
CREATE TYPE admin_rol AS ENUM (
  'super_admin',      -- Control total del sistema
  'admin_empresa',    -- Administrador de empresa específica
  'viewer_general',   -- Visualizador de datos globales
  'auditor'           -- Solo lectura de logs y auditoría
);

-- Tabla de roles administrativos
CREATE TABLE admin_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol admin_rol NOT NULL DEFAULT 'viewer_general',
  empresa_id BIGINT REFERENCES empresas(id) ON DELETE CASCADE,
  asignado_por UUID REFERENCES auth.users(id),
  fecha_asignacion TIMESTAMP DEFAULT NOW(),
  fecha_expiracion TIMESTAMP,
  motivo TEXT,
  UNIQUE(user_id, rol, empresa_id)
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_admin_roles_user_id ON admin_roles(user_id);
CREATE INDEX idx_admin_roles_rol ON admin_roles(rol);
CREATE INDEX idx_admin_roles_empresa_id ON admin_roles(empresa_id);
CREATE INDEX idx_admin_roles_fecha ON admin_roles(fecha_asignacion);

-- RLS: Solo super_admin puede ver y modificar admin_roles
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_view_all_roles" ON admin_roles
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM admin_roles WHERE rol = 'super_admin'
    )
  );

CREATE POLICY "super_admin_insert_roles" ON admin_roles
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM admin_roles WHERE rol = 'super_admin'
    )
  );

CREATE POLICY "super_admin_update_roles" ON admin_roles
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM admin_roles WHERE rol = 'super_admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM admin_roles WHERE rol = 'super_admin'
    )
  );

CREATE POLICY "super_admin_delete_roles" ON admin_roles
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT user_id FROM admin_roles WHERE rol = 'super_admin'
    )
  );

-- Función auxiliar: verificar si un usuario es super_admin
CREATE OR REPLACE FUNCTION es_super_admin(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM admin_roles 
    WHERE user_id = COALESCE(p_user_id, auth.uid())
    AND rol = 'super_admin'
    AND (fecha_expiracion IS NULL OR fecha_expiracion > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función auxiliar: obtener roles de un usuario
CREATE OR REPLACE FUNCTION get_user_roles(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(rol admin_rol, empresa_id BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT ar.rol, ar.empresa_id
  FROM admin_roles ar
  WHERE ar.user_id = COALESCE(p_user_id, auth.uid())
  AND (ar.fecha_expiracion IS NULL OR ar.fecha_expiracion > NOW())
  ORDER BY ar.rol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentarios de documentación
COMMENT ON TABLE admin_roles IS 'Tabla de roles y permisos administrativos del sistema';
COMMENT ON COLUMN admin_roles.user_id IS 'Usuario a quien se asigna el rol';
COMMENT ON COLUMN admin_roles.rol IS 'Tipo de rol: super_admin, admin_empresa, viewer_general, auditor';
COMMENT ON COLUMN admin_roles.empresa_id IS 'Empresa asociada (NULL si el rol es global)';
COMMENT ON COLUMN admin_roles.asignado_por IS 'Usuario que asignó el rol (auditoría)';
COMMENT ON COLUMN admin_roles.fecha_expiracion IS 'Fecha de vencimiento del rol (NULL = sin expiración)';
