-- FinanzAdmin Pro — Logs y auditoría

-- Enum para tipos de acciones
CREATE TYPE admin_accion AS ENUM (
  'crear',
  'actualizar',
  'eliminar',
  'ver',
  'exportar',
  'importar',
  'login',
  'logout',
  'cambiar_config',
  'ejecutar_job',
  'cancelar_job',
  'cambiar_rol',
  'acceso_denegado'
);

-- Tabla de logs administrativos
CREATE TABLE admin_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  accion admin_accion NOT NULL,
  entidad VARCHAR(255) NOT NULL,
  -- TEXT y no UUID/BIGINT: `entidad` es polimórfica y apunta a tablas con
  -- claves de distinto tipo (empresas/precios_jobs usan uuid; notificaciones,
  -- bigserial). Un tipo fijo haría fallar la mitad de los registros.
  entidad_id TEXT,
  detalles JSONB,
  ip_address INET,
  user_agent TEXT,
  estado VARCHAR(50) DEFAULT 'success', -- success, error, pending
  mensaje_error TEXT,
  duracion_ms INTEGER,
  -- timestamptz, no timestamp: el resto del esquema (0001-0010) usa
  -- timestamptz. Con timestamp los logs quedarían en UTC sin marca de zona
  -- y ordenarían mal frente al resto de tablas.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para búsquedas y análisis
CREATE INDEX idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_accion ON admin_logs(accion);
CREATE INDEX idx_admin_logs_entidad ON admin_logs(entidad);
CREATE INDEX idx_admin_logs_estado ON admin_logs(estado);
CREATE INDEX idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX idx_admin_logs_composite ON admin_logs(admin_id, accion, created_at DESC);

-- Particionamiento por fecha (opcional, para tablas muy grandes)
-- Sin particionamiento por ahora; se puede añadir si la tabla crece.

-- RLS: Solo super_admin puede ver todos los logs
-- Los demás solo ven logs de sus propias acciones
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_view_all_logs" ON admin_logs
  FOR SELECT
  USING (
    public.is_super_admin()
  );

-- El rol 'auditor' se descartó: el proyecto solo define app_role
-- ('super_admin','usuario') (decisión D6). Una política que consultara una
-- tabla admin_roles inexistente no concedería acceso a nadie.

CREATE POLICY "own_logs_view" ON admin_logs
  FOR SELECT
  USING (admin_id = auth.uid());

CREATE POLICY "admin_insert_logs" ON admin_logs
  FOR INSERT
  WITH CHECK (admin_id = auth.uid());

-- RLS: Nadie puede modificar o eliminar logs (solo crear/leer)
CREATE POLICY "no_update_logs" ON admin_logs
  FOR UPDATE
  USING (FALSE);

CREATE POLICY "no_delete_logs" ON admin_logs
  FOR DELETE
  USING (FALSE);

-- Función para registrar acciones administrativas
CREATE OR REPLACE FUNCTION registrar_admin_log(
  p_accion admin_accion,
  p_entidad VARCHAR(255),
  p_entidad_id TEXT DEFAULT NULL,
  p_detalles JSONB DEFAULT NULL,
  p_estado VARCHAR(50) DEFAULT 'success',
  p_mensaje_error TEXT DEFAULT NULL,
  p_duracion_ms INTEGER DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_log_id BIGINT;
BEGIN
  INSERT INTO admin_logs (
    admin_id,
    accion,
    entidad,
    entidad_id,
    detalles,
    ip_address,
    estado,
    mensaje_error,
    duracion_ms
  ) VALUES (
    auth.uid(),
    p_accion,
    p_entidad,
    p_entidad_id,
    p_detalles,
    CAST(current_setting('request.header.x-forwarded-for', true) AS INET),
    p_estado,
    p_mensaje_error,
    p_duracion_ms
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener logs filtrados
CREATE OR REPLACE FUNCTION get_admin_logs(
  p_accion admin_accion DEFAULT NULL,
  p_entidad VARCHAR(255) DEFAULT NULL,
  p_estado VARCHAR(50) DEFAULT NULL,
  p_desde TIMESTAMPTZ DEFAULT NULL,
  p_hasta TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id BIGINT,
  admin_id UUID,
  accion admin_accion,
  entidad VARCHAR(255),
  entidad_id TEXT,
  detalles JSONB,
  ip_address INET,
  estado VARCHAR(50),
  mensaje_error TEXT,
  duracion_ms INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.id,
    al.admin_id,
    al.accion,
    al.entidad,
    al.entidad_id,
    al.detalles,
    al.ip_address,
    al.estado,
    al.mensaje_error,
    al.duracion_ms,
    al.created_at
  FROM admin_logs al
  WHERE (p_accion IS NULL OR al.accion = p_accion)
    AND (p_entidad IS NULL OR al.entidad = p_entidad)
    AND (p_estado IS NULL OR al.estado = p_estado)
    AND (p_desde IS NULL OR al.created_at >= p_desde)
    AND (p_hasta IS NULL OR al.created_at <= p_hasta)
    AND (
      -- Super admin ve todo; el resto, solo sus propias acciones.
      public.is_super_admin()
      OR al.admin_id = auth.uid()
    )
  ORDER BY al.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener estadísticas de logs
CREATE OR REPLACE FUNCTION get_logs_stats(
  p_dias INTEGER DEFAULT 30
)
RETURNS TABLE(
  total_acciones BIGINT,
  acciones_exitosas BIGINT,
  acciones_fallidas BIGINT,
  entidades_unicas INTEGER,
  admins_activos INTEGER,
  tiempo_promedio_ms NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_acciones,
    COUNT(*) FILTER (WHERE estado = 'success')::BIGINT as acciones_exitosas,
    COUNT(*) FILTER (WHERE estado = 'error')::BIGINT as acciones_fallidas,
    COUNT(DISTINCT entidad)::INTEGER as entidades_unicas,
    COUNT(DISTINCT admin_id)::INTEGER as admins_activos,
    ROUND(AVG(duracion_ms)::numeric, 2) as tiempo_promedio_ms
  FROM admin_logs
  WHERE created_at >= NOW() - (p_dias || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentarios de documentación
COMMENT ON TABLE admin_logs IS 'Tabla de auditoría: registra todas las acciones administrativas del sistema';
COMMENT ON COLUMN admin_logs.admin_id IS 'Usuario que realizó la acción';
COMMENT ON COLUMN admin_logs.accion IS 'Tipo de acción: crear, actualizar, eliminar, etc.';
COMMENT ON COLUMN admin_logs.entidad IS 'Tabla/entidad afectada: empresas, brokers, usuarios, etc.';
COMMENT ON COLUMN admin_logs.entidad_id IS 'ID del registro afectado';
COMMENT ON COLUMN admin_logs.detalles IS 'Información adicional en JSON (valores antes/después, etc.)';
COMMENT ON COLUMN admin_logs.ip_address IS 'IP desde la cual se realizó la acción';
COMMENT ON COLUMN admin_logs.estado IS 'Estado de la acción: success, error, pending';
COMMENT ON COLUMN admin_logs.mensaje_error IS 'Mensaje de error si la acción falló';
COMMENT ON COLUMN admin_logs.duracion_ms IS 'Tiempo de ejecución en milisegundos';
