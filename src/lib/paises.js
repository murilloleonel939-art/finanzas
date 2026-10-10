/**
 * Países para `empresas.pais` .
 *
 * `pais` es texto libre en la base (PRD §2), así que esta lista solo alimenta
 * el selector: no hay FK ni validación en el esquema, a propósito. Una empresa
 * puede tener su sede en un país que no esté aquí y no debe quedar bloqueada
 * por eso — de ahí la opción "Otro".
 *
 * Se usa ISO 3166-1 alpha-2 en mayúsculas, que es el mismo formato que usa
 * `bancos.pais` (migración 0002) y que el catálogo de bancos por país de la
 * `bancosPorPais.js`. Si los dos usaran formatos distintos, cruzar
 * "país de la empresa" con "país del banco" exigiría una tabla de traducción.
 */
export const PAISES = [
  { codigo: 'AR', nombre: 'Argentina' },
  { codigo: 'BO', nombre: 'Bolivia' },
  { codigo: 'BR', nombre: 'Brasil' },
  { codigo: 'CA', nombre: 'Canadá' },
  { codigo: 'CL', nombre: 'Chile' },
  { codigo: 'CO', nombre: 'Colombia' },
  { codigo: 'CR', nombre: 'Costa Rica' },
  { codigo: 'CU', nombre: 'Cuba' },
  { codigo: 'DO', nombre: 'República Dominicana' },
  { codigo: 'EC', nombre: 'Ecuador' },
  { codigo: 'SV', nombre: 'El Salvador' },
  { codigo: 'ES', nombre: 'España' },
  { codigo: 'US', nombre: 'Estados Unidos' },
  { codigo: 'GT', nombre: 'Guatemala' },
  { codigo: 'HN', nombre: 'Honduras' },
  { codigo: 'MX', nombre: 'México' },
  { codigo: 'NI', nombre: 'Nicaragua' },
  { codigo: 'PA', nombre: 'Panamá' },
  { codigo: 'PY', nombre: 'Paraguay' },
  { codigo: 'PE', nombre: 'Perú' },
  { codigo: 'PT', nombre: 'Portugal' },
  { codigo: 'PR', nombre: 'Puerto Rico' },
  { codigo: 'GB', nombre: 'Reino Unido' },
  { codigo: 'UY', nombre: 'Uruguay' },
  { codigo: 'VE', nombre: 'Venezuela' },
]

/** Centinela del selector. No se guarda nunca en la base. */
export const OTRO_PAIS = '__otro__'

export function nombrePais(codigo) {
  if (!codigo) return ''
  return PAISES.find((p) => p.codigo === codigo)?.nombre ?? codigo
}
