# Edge Functions — despliegue

FASE 10. Dos funciones, `invitar-usuario` y `actualizar-usuario`.

## Por qué son Edge Functions y no código del frontend

Crear un usuario o cambiarle el `app_role` exige la **service_role key**, que se
salta el RLS por completo. Esa clave no puede estar en el navegador: el bundle
es público. La función es el único lugar donde vive, y la usa **solo después**
de verificar que quien llama es un `super_admin` activo.

## Requisitos previos

1. **Node 18+** (ya lo tienes) y el CLI de Supabase:
   ```bash
   npm install -g supabase
   supabase --version
   ```
2. **Iniciar sesión y enlazar el proyecto** (una vez):
   ```bash
   supabase login
   supabase link --project-ref <tu-project-ref>
   ```
   El `<project-ref>` es el identificador que aparece en la URL del dashboard:
   `https://supabase.com/dashboard/project/<project-ref>`. En este repo el
   proyecto apunta a `obxedjpnusceyizcdbvc` (está en `.env.local`).
3. **SMTP propio configurado** (decisión D10). Sin esto las invitaciones no
   llegan: el correo integrado de Supabase está limitado a ~2/hora y solo
   entrega de forma fiable a miembros del equipo. Ver
   `docs/04-SETUP-SUPABASE.md`, paso 6.

## Despliegue

Desde la raíz del repo:

```bash
supabase functions deploy invitar-usuario    --project-ref obxedjpnusceyizcdbvc
supabase functions deploy actualizar-usuario --project-ref obxedjpnusceyizcdbvc
```

O las dos de una vez, si el proyecto está enlazado:

```bash
supabase functions deploy
```

**No hace falta `supabase secrets set`.** `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente en el runtime.

## Verificar que quedaron desplegadas

```bash
supabase functions list
```

Y una prueba real desde el navegador: entra como `super_admin` a
`/admin/usuarios` e invita un email tuyo distinto. Debe salir `ok: true` en la
respuesta y llegar el correo.

Si el frontend recibe `Failed to send a request to the Edge Function`, casi
siempre es una de estas tres:

| Síntoma | Causa |
|---|---|
| `404` en la consola | La función no está desplegada, o el nombre no coincide exactamente (`invitar-usuario`, con guion). |
| Error de CORS | El navegador bloqueó la respuesta. Se resuelve con las cabeceras de `_shared/cors.ts`; ya están. |
| `401` / `403` | El rol de quien llama no es `super_admin` activo, o la sesión caducó. Es el comportamiento correcto. |

## Estructura

```
supabase/
  config.toml                  ← configuración de las funciones (verify_jwt)
  functions/
    _shared/
      cors.ts                  cabeceras comunes
      auth.ts                  requireSuperAdmin() — la puerta de entrada
      empresas.ts              validar/asignar empresas + guarda del último admin
    invitar-usuario/index.ts   inviteUserByEmail + asignación
    actualizar-usuario/index.ts  rol, estado, empresas, reenvío de enlace
```

`_shared/` no se despliega como función: el CLI ignora las carpetas que
empiezan por guion bajo, pero incluye su contenido dentro de cada función por
el import relativo. Por eso el deploy hay que hacerlo desde `supabase/functions`
y no subiendo archivos sueltos al dashboard.

## Qué comprueba cada función por dentro

Ambas empiezan con `requireSuperAdmin()`, que:

1. Exige el header `Authorization`.
2. Verifica la firma del token con `auth.getUser()`.
3. Lee el profile del llamante y exige `app_role = 'super_admin'` **y**
   `estado = 'activo'`.
4. Solo entonces construye el cliente con `service_role`.

Un `cliente` autenticado recibe `403`. Un anónimo, `401`. La service_role key
nunca sale de la función.

La lectura del propio perfil siempre pasa el RLS (`profiles_select` incluye
`id = auth.uid()`), así que la autorización no necesita la service_role para
decidir: se decide antes de tenerla.

## Guarda del último administrador

Con `service_role` no hay `auth.uid()`, así que el trigger
`proteger_campos_profile` de la migración 0006 no se activa — esa era
precisamente su condición de salida. Sin un chequeo explícito, el panel podría
quedarse sin ningún `super_admin` activo y no habría forma de recuperarlo desde
la interfaz (habría que ir al SQL Editor).

`actualizar-usuario` lo impide en los dos caminos que lo causan:

- quitarle el rol a un `super_admin`,
- desactivar a un `super_admin` activo.

En ambos casos responde `409` con `codigo: 'ULTIMO_ADMIN'`, y también bloquea
que un administrador se desactive o se baje el rol **a sí mismo**, que es el
fallo más fácil de cometer en la interfaz.
