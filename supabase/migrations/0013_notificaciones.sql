-- FinanzAdmin Pro — Notificaciones por email

CREATE TYPE notif_estado AS ENUM ('pendiente', 'enviado', 'error');

CREATE TYPE notif_tipo AS ENUM (
  'bienvenida',
  'alerta_precios',
  'reporte_diario',
  'resumen_semanal',
  'prueba',
  'personalizado'
);

CREATE TABLE notificaciones (
  id BIGSERIAL PRIMARY KEY,
  tipo notif_tipo NOT NULL DEFAULT 'personalizado',
  destinatario TEXT NOT NULL,
  asunto TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  estado notif_estado NOT NULL DEFAULT 'pendiente',
  error_mensaje TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  enviado_en TIMESTAMPTZ,
  creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_estado ON notificaciones(estado);
CREATE INDEX idx_notif_tipo ON notificaciones(tipo);
CREATE INDEX idx_notif_created ON notificaciones(created_at DESC);

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- Solo super_admin ve y crea notificaciones. Sin UPDATE/DELETE: el historial
-- de envíos es auditoría, se corrige con un envío nuevo, no editando el viejo.
CREATE POLICY "super_admin_select_notif" ON notificaciones
  FOR SELECT USING (
    public.is_super_admin()
  );

CREATE POLICY "super_admin_insert_notif" ON notificaciones
  FOR INSERT WITH CHECK (
    public.is_super_admin()
  );

CREATE POLICY "no_update_notif" ON notificaciones FOR UPDATE USING (FALSE);
CREATE POLICY "no_delete_notif" ON notificaciones FOR DELETE USING (FALSE);

-- Plantillas reutilizables, editables desde el panel de configuración.
CREATE TABLE notif_plantillas (
  id BIGSERIAL PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  asunto TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  descripcion TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notif_plantillas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_plantillas" ON notif_plantillas
  FOR ALL USING (
    public.is_super_admin()
  ) WITH CHECK (
    public.is_super_admin()
  );

INSERT INTO notif_plantillas (clave, asunto, cuerpo, descripcion) VALUES
  ('bienvenida',
   'Bienvenido a FinanzAdmin Pro',
   E'Hola {{nombre}},\n\nTu cuenta ya está activa. Podés ingresar en {{url}}.\n\nSaludos.',
   'Email de alta de usuario'),
  ('alerta_precios',
   'Actualización de precios: {{errores}} errores',
   E'La actualización de precios terminó con {{errores}} errores sobre {{total}} activos.\n\nRevisá el panel de jobs.',
   'Aviso cuando falla la actualización de precios'),
  ('reporte_diario',
   'Reporte diario {{fecha}}',
   E'Resumen del día {{fecha}}:\n\n{{resumen}}\n\nVer detalle en el panel.',
   'Reporte diario automático'),
  ('prueba',
   'Prueba de configuración SMTP',
   E'Este es un email de prueba enviado desde el panel de FinanzAdmin Pro.\n\nSi lo estás leyendo, el SMTP quedó bien configurado.',
   'Verificar que el SMTP funciona')
ON CONFLICT (clave) DO NOTHING;

-- Credenciales SMTP que faltaban en 0013. Sin usuario/clave, nodemailer
-- funciona en relays abiertos (MailHog, un Postfix local), que es justo el
-- caso de un despliegue en Coolify sin proveedor externo.
INSERT INTO admin_config (clave, valor, tipo, descripcion, grupo, editable) VALUES
  ('EMAIL_SMTP_USER', '', 'string', 'Usuario SMTP (vacío si el relay no pide auth)', 'email', TRUE),
  ('EMAIL_SMTP_PASS', '', 'string', 'Contraseña SMTP (vacío si el relay no pide auth)', 'email', TRUE),
  ('EMAIL_SMTP_SECURE', 'false', 'boolean', 'Forzar TLS implícito (true solo en puerto 465)', 'email', TRUE)
ON CONFLICT (clave) DO NOTHING;

COMMENT ON TABLE notificaciones IS 'Historial y cola de emails enviados por el sistema';
COMMENT ON TABLE notif_plantillas IS 'Plantillas de email con placeholders {{clave}}';
