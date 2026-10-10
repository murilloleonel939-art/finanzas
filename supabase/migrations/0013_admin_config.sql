-- FASE 20: Admin Config y Configuración del Sistema

-- Tabla de configuración dinámica del sistema
CREATE TABLE admin_config (
  id BIGSERIAL PRIMARY KEY,
  clave VARCHAR(255) NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  tipo VARCHAR(50) NOT NULL, -- string, integer, boolean, json
  descripcion TEXT,
  grupo VARCHAR(100), -- sistema, email, cron, integraciones
  editable BOOLEAN DEFAULT TRUE,
  actualizado_por UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_admin_config_clave ON admin_config(clave);
CREATE INDEX idx_admin_config_grupo ON admin_config(grupo);
CREATE INDEX idx_admin_config_updated_at ON admin_config(updated_at DESC);

-- RLS: Solo super_admin puede ver y modificar configuración
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_view_config" ON admin_config
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM admin_roles WHERE rol = 'super_admin'
    )
  );

CREATE POLICY "super_admin_update_config" ON admin_config
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM admin_roles WHERE rol = 'super_admin'
    )
    AND editable = TRUE
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM admin_roles WHERE rol = 'super_admin'
    )
    AND editable = TRUE
  );

CREATE POLICY "super_admin_insert_config" ON admin_config
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM admin_roles WHERE rol = 'super_admin'
    )
  );

-- No permitir eliminación de configuración
CREATE POLICY "no_delete_config" ON admin_config
  FOR DELETE
  USING (FALSE);

-- Función para obtener un valor de configuración
CREATE OR REPLACE FUNCTION get_config(p_clave VARCHAR(255), p_default TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
  v_valor TEXT;
BEGIN
  SELECT valor INTO v_valor FROM admin_config WHERE clave = p_clave;
  RETURN COALESCE(v_valor, p_default);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para actualizar configuración
CREATE OR REPLACE FUNCTION update_config(
  p_clave VARCHAR(255),
  p_valor TEXT,
  p_tipo VARCHAR(50) DEFAULT 'string'
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verificar que el usuario sea super_admin
  IF NOT (auth.uid() IN (SELECT user_id FROM admin_roles WHERE rol = 'super_admin')) THEN
    RAISE EXCEPTION 'Solo super_admin puede actualizar configuración';
  END IF;

  -- Actualizar o insertar
  INSERT INTO admin_config (clave, valor, tipo, actualizado_por, updated_at)
  VALUES (p_clave, p_valor, p_tipo, auth.uid(), NOW())
  ON CONFLICT (clave) DO UPDATE
  SET valor = p_valor, 
      tipo = p_tipo,
      actualizado_por = auth.uid(),
      updated_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener toda la configuración
CREATE OR REPLACE FUNCTION get_all_config(p_grupo VARCHAR(100) DEFAULT NULL)
RETURNS TABLE(
  id BIGINT,
  clave VARCHAR(255),
  valor TEXT,
  tipo VARCHAR(50),
  descripcion TEXT,
  grupo VARCHAR(100),
  editable BOOLEAN,
  updated_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ac.id,
    ac.clave,
    ac.valor,
    ac.tipo,
    ac.descripcion,
    ac.grupo,
    ac.editable,
    ac.updated_at
  FROM admin_config ac
  WHERE (p_grupo IS NULL OR ac.grupo = p_grupo)
  ORDER BY ac.grupo, ac.clave;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insertar configuración por defecto
INSERT INTO admin_config (clave, valor, tipo, descripcion, grupo, editable) VALUES
  ('SISTEMA_NOMBRE', 'FinanzAdmin Pro', 'string', 'Nombre del sistema', 'sistema', TRUE),
  ('SISTEMA_VERSION', '2.0.0', 'string', 'Versión del sistema', 'sistema', FALSE),
  ('SISTEMA_TIMEZONE', 'America/Buenos_Aires', 'string', 'Zona horaria del servidor', 'sistema', TRUE),
  ('SISTEMA_MANTENIMIENTO', 'false', 'boolean', 'Modo de mantenimiento habilitado', 'sistema', TRUE),
  
  ('EMAIL_ACTIVO', 'false', 'boolean', 'Envío de emails habilitado', 'email', TRUE),
  ('EMAIL_REMITENTE', 'noreply@finanzas.local', 'string', 'Dirección de remitente', 'email', TRUE),
  ('EMAIL_SMTP_HOST', 'localhost', 'string', 'Host SMTP', 'email', TRUE),
  ('EMAIL_SMTP_PORT', '587', 'integer', 'Puerto SMTP', 'email', TRUE),
  
  ('CRON_PRECIOS_HABILITADO', 'true', 'boolean', 'Job de actualización de precios habilitado', 'cron', TRUE),
  ('CRON_PRECIOS_HORA', '16', 'integer', 'Hora del día para ejecutar cron de precios (0-23)', 'cron', TRUE),
  ('CRON_PRECIOS_MINUTO', '0', 'integer', 'Minuto del cron de precios', 'cron', TRUE),
  ('CRON_PRECIOS_TIMEOUT_SEG', '300', 'integer', 'Timeout en segundos para precios', 'cron', TRUE),
  
  ('API_RATE_LIMIT_POR_MINUTO', '60', 'integer', 'Límite de requests por minuto', 'integraciones', TRUE),
  ('API_TIMEOUT_SEGUNDOS', '30', 'integer', 'Timeout para llamadas API externas', 'integraciones', TRUE),
  ('LOGS_RETENER_DIAS', '90', 'integer', 'Días a retener logs administrativos', 'sistema', TRUE),
  ('LOGS_NIVEL_MINIMO', 'info', 'string', 'Nivel mínimo de logging: debug, info, warning, error', 'sistema', TRUE)
ON CONFLICT (clave) DO NOTHING;

-- Comentarios de documentación
COMMENT ON TABLE admin_config IS 'Tabla de configuración dinámica del sistema. Controla comportamiento global.';
COMMENT ON COLUMN admin_config.clave IS 'Identificador único de configuración (ej: CRON_PRECIOS_HABILITADO)';
COMMENT ON COLUMN admin_config.valor IS 'Valor de configuración (string, número, booleano o JSON)';
COMMENT ON COLUMN admin_config.tipo IS 'Tipo de dato: string, integer, boolean, json';
COMMENT ON COLUMN admin_config.grupo IS 'Agrupación lógica: sistema, email, cron, integraciones';
COMMENT ON COLUMN admin_config.editable IS 'Si es FALSE, solo root puede cambiarla';
COMMENT ON COLUMN admin_config.actualizado_por IS 'Usuario que realizó el último cambio';
