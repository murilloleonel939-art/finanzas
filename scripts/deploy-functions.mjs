#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const projectRef = process.env.SUPABASE_PROJECT_REF || 'yomjsavmtlqykwtxqssn'
const accessToken = process.env.SUPABASE_ACCESS_TOKEN

if (!accessToken) {
  console.error('Falta SUPABASE_ACCESS_TOKEN. Configúrala como variable secreta en Coolify.')
  process.exit(1)
}

const funciones = ['invitar-usuario', 'actualizar-usuario']

for (const funcion of funciones) {
  console.log(`\nPublicando Edge Function: ${funcion}`)

  const resultado = spawnSync(
    'npx',
    [
      '--yes',
      'supabase',
      'functions',
      'deploy',
      funcion,
      '--project-ref',
      projectRef,
      '--workdir',
      '.',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
    }
  )

  if (resultado.error) {
    console.error(`No se pudo ejecutar el despliegue de ${funcion}: ${resultado.error.message}`)
    process.exit(1)
  }

  if (resultado.status !== 0) {
    console.error(`Falló el despliegue de ${funcion}.`)
    process.exit(resultado.status ?? 1)
  }
}

console.log('\nEdge Functions publicadas correctamente.')
