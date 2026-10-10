import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

/**
 * Edge Function: crear-import-job
 * 
 * Recibe un PDF, lo sube a Storage, y crea un job de importación
 * que el worker en EC2 procesará con la IA.
 * 
 * POST /functions/v1/crear-import-job
 * {
 *   "empresa_id": "uuid",
 *   "destino": "cuenta|broker|wallet",
 *   "destino_id": "uuid",
 *   "archivo": <File>,
 *   "proveedor": "opcional"
 * }
 */
Deno.serve(async (req) => {
  try {
    // Validar método
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST required' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parsear FormData (el archivo viene así desde el navegador)
    const formData = await req.formData();
    const archivo = formData.get('archivo');
    const empresa_id = formData.get('empresa_id');
    const destino = formData.get('destino');
    const destino_id = formData.get('destino_id');
    const proveedor = formData.get('proveedor') || null;

    // Validar campos
    if (!archivo || !empresa_id || !destino || !destino_id) {
      return new Response(
        JSON.stringify({
          error: 'Faltan campos: archivo, empresa_id, destino, destino_id',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!['cuenta', 'broker', 'wallet'].includes(destino)) {
      return new Response(
        JSON.stringify({
          error: 'destino debe ser: cuenta | broker | wallet',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verificar que es PDF
    if (archivo.type !== 'application/pdf') {
      return new Response(
        JSON.stringify({ error: 'Solo se aceptan archivos PDF' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Subir el PDF a Storage
    const buffer = await archivo.arrayBuffer();
    const timestamp = Date.now();
    const filename = `${timestamp}-${archivo.name}`;
    const storagePath = `${empresa_id}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('extractos')
      .upload(storagePath, new Uint8Array(buffer), {
        contentType: 'application/pdf',
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: `No se pudo subir el PDF: ${uploadError.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Crear el job en la base de datos
    const { data: jobData, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        empresa_id,
        destino,
        destino_id,
        archivo_url: storagePath,
        proveedor,
        estado: 'pendiente',
        payload: null,
        resultado: null,
        error_msg: null,
      })
      .select('*')
      .single();

    if (jobError) {
      console.error('Job creation error:', jobError);
      // Intentar limpiar el archivo subido
      await supabase.storage.from('extractos').remove([storagePath]);
      return new Response(
        JSON.stringify({ error: `No se pudo crear el job: ${jobError.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Retornar el job creado
    return new Response(
      JSON.stringify({
        success: true,
        job: jobData,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: `Error interno: ${error.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
