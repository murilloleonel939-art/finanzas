/**
 * Catálogo de bancos por país (FASE 13, PRD §4).
 *
 * Alimenta el selector de `CrearBanco`. `bancos.pais` y `bancos.nombre_banco`
 * son texto libre en la base (migración 0002): este catálogo **no valida ni
 * bloquea** nada, solo ofrece las opciones habituales. Un banco que no esté
 * aquí se guarda igual escribiendo el nombre, o eligiendo «Otro».
 *
 * El código de país es ISO 3166-1 alpha-2 en mayúsculas, el mismo formato que
 * `empresas.pais` (`lib/paises.js`). Si divergieran, cruzar "país de la
 * empresa" con "país del banco" exigiría una tabla de traducción.
 */
import { OTRO_PAIS } from '@/lib/paises'

/**
 * Países con catálogo de bancos, en el orden del PRD §4.
 *
 * Incluye países que no están en `PAISES` (Costa Rica, Guatemala, Honduras,
 * El Salvador): una empresa puede estar registrada en un país y operar una
 * cuenta en otro, así que limitar esta lista a la de empresas perdería bancos
 * reales de Centroamérica.
 */
export const BANCOS_POR_PAIS = {
  CO: [
    'Bancolombia',
    'Banco de Bogotá',
    'Davivienda',
    'BBVA Colombia',
    'Banco de Occidente',
    'Banco Popular',
    'Scotiabank Colpatria',
    'Itaú Colombia',
    'Banco AV Villas',
    'Banco Caja Social',
    'Bancamía',
    'Nequi',
  ],
  MX: [
    'BBVA México',
    'Banorte',
    'Santander México',
    'Citibanamex',
    'HSBC México',
    'Scotiabank México',
    'Banco Azteca',
    'Banco del Bajío',
    'Nu México',
    'Banco Inbursa',
  ],
  AR: [
    'Banco de la Nación Argentina',
    'Banco de la Provincia de Buenos Aires',
    'Banco Galicia',
    'Banco Santander Argentina',
    'BBVA Argentina',
    'Banco Macro',
    'Banco Credicoop',
    'Banco HSBC Argentina',
    'Banco Ciudad',
    'Brubank',
  ],
  CL: [
    'Banco de Chile',
    'Banco Santander Chile',
    'Banco de Crédito e Inversiones (BCI)',
    'Banco Itaú Chile',
    'Scotiabank Chile',
    'Banco Estado',
    'Banco BICE',
    'Banco Security',
    'Banco Falabella',
    'Banco Ripley',
  ],
  PE: [
    'Banco de Crédito del Perú (BCP)',
    'BBVA Perú',
    'Interbank',
    'Scotiabank Perú',
    'Banco Interamericano de Finanzas (BanBif)',
    'Banco Pichincha Perú',
    'Mibanco',
    'Banco de la Nación',
    'Banco GNB',
    'Banco Falabella Perú',
  ],
  EC: [
    'Banco Pichincha',
    'Banco Guayaquil',
    'Produbanco',
    'Banco de la Pacífico',
    'Banco Internacional',
    'Banco del Austro',
    'Banco Bolivariano',
    'Banco de Loja',
    'BanEcuador',
    'JEP Cooperativa',
  ],
  ES: [
    'Banco Santander',
    'BBVA',
    'CaixaBank',
    'Banco Sabadell',
    'Bankinter',
    'Unicaja Banco',
    'Abanca',
    'Ibercaja',
    'Cajamar',
    'Openbank',
    'ING España',
    'Revolut Bank',
  ],
  US: [
    'Bank of America',
    'Chase (JPMorgan Chase)',
    'Wells Fargo',
    'Citibank',
    'Capital One',
    'US Bank',
    'PNC Bank',
    'TD Bank',
    'Charles Schwab Bank',
    'Ally Bank',
    'Discover Bank',
    'Mercantil Bank',
  ],
  PA: [
    'Banco General',
    'Banistmo',
    'Banco Nacional de Panamá',
    'Banco Nacional de Costa Rica',
    'BAC Credomatic',
    'Banco Aliado',
    'Banco Delta',
    'Banco Ficohsa Panamá',
    'Banco La Hipotecaria',
    'Banco de Occidente Panamá',
  ],
  CR: [
    'Banco Nacional de Costa Rica',
    'Banco de Costa Rica',
    'Banco Popular y de Desarrollo Comunal',
    'BAC Credomatic',
    'Banco Davivienda Costa Rica',
    'Banco Promerica',
    'Banco Improsa',
  ],
  GT: ['Banco Industrial', 'Banco G&T Continental', 'Banrural', 'BAC Credomatic', 'Banco Agromercantil'],
  SV: ['Banco Agrícola', 'Banco Cuscatlán', 'Banco Davivienda El Salvador', 'Banco Promerica', 'Banco Atlántida'],
  HN: ['Banco Atlántida', 'Banpaís', 'BAC Credomatic', 'Banco de Occidente Honduras', 'Banco Ficohsa'],
}

/** Códigos de país con catálogo, en el orden de declaración (no alfabético). */
export const PAISES_CON_BANCOS = Object.keys(BANCOS_POR_PAIS)

/** Centinela para un banco fuera del catálogo. Nunca se guarda en la base. */
export const OTRO_BANCO = '__otro__'

/**
 * Bancos del país indicado, ordenados alfabéticamente para el selector.
 * Un país sin catálogo (o `undefined`) devuelve lista vacía, no un error: la
 * pantalla debe seguir permitiendo escribir el banco a mano.
 */
export function bancosDePais(codigoPais) {
  if (!codigoPais) return []
  const lista = BANCOS_POR_PAIS[codigoPais.toUpperCase()]
  if (!lista) return []
  // localeCompare en español: "Ávila" ordena junto a "Avila", no al final.
  return [...lista].sort((a, b) => a.localeCompare(b, 'es'))
}

/** `true` si el código de país tiene bancos en el catálogo. */
export function tieneCatalogo(codigoPais) {
  return Boolean(codigoPais && BANCOS_POR_PAIS[codigoPais.toUpperCase()])
}

/**
 * Valor que debe enviarse a la base a partir de lo elegido en el formulario.
 * Devuelve `null` cuando no hay nada que guardar (`CrearBanco` lo trata como
 * "campo vacío", no como error de esquema).
 */
export function resolverNombreBanco(seleccion, escritoAMano) {
  if (seleccion === OTRO_BANCO) {
    const limpio = (escritoAMano ?? '').trim()
    return limpio || null
  }
  return seleccion || null
}

export { OTRO_PAIS }
