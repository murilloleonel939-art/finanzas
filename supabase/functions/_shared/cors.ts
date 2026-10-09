// =====================================================================
// Cabeceras CORS compartidas por las Edge Functions.
// =====================================================================
// El frontend vive en EC2/Coolify y en localhost:5173, un origen DISTINTO
// al dominio de Supabase. Sin estas cabeceras, el navegador bloquea la
// respuesta antes de que el código JS pueda leerla.
//
// Se permite '*' porque la autorización NO depende del origen: depende del
// JWT que viaja en el header Authorization. El navegador no puede falsificar
// ese JWT, así que un origen ajeno que llame a la función sigue necesitando
// una sesión válida de super_admin. Restringir el origen aquí solo añadiría
// una lista que hay que mantener en cada despliegue.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Respuesta JSON con las cabeceras CORS ya aplicadas. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
