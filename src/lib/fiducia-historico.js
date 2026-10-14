// El porcentaje del extracto no representa necesariamente una tasa mensual:
// no se suma ni se capitaliza para obtener la rentabilidad acumulada.
export function calcularHistoricoFiducia(activos = [], ano, corte = 'all') {
  const registros = activos.filter((activo) => /^\d{4}-(0[1-9]|1[0-2])$/.test(activo.periodo || '') && activo.periodo.startsWith(`${ano}-`) && (corte === 'all' || activo.periodo === corte))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
  const meses = new Set(registros.map((activo) => activo.periodo))
  const ultimoMes = registros.at(-1)?.periodo
  const hasta = corte === 'all' ? Number(ultimoMes?.slice(5) || 0) : 0
  const faltantes = Array.from({ length: hasta }, (_, indice) => `${ano}-${String(indice + 1).padStart(2, '0')}`).filter((mes) => !meses.has(mes))
  const ganancias = registros.reduce((centavos, activo) => centavos + Math.round(Number(activo.rendimientos_netos || 0) * 100), 0) / 100
  const saldoInicial = registros[0]?.saldo_anterior ?? null
  const saldoFinal = registros.at(-1)?.nuevo_saldo ?? null
  const inicialNumero = Number(saldoInicial)
  const porcentaje = registros.length && Number.isFinite(inicialNumero) && inicialNumero > 0 ? ganancias / inicialNumero * 100 : null
  const ajustes = registros.some((activo) => [activo.saldo_anterior, activo.nuevo_saldo, activo.rendimientos_netos].every((valor) => valor != null) && Math.abs(Number(activo.nuevo_saldo) - Number(activo.saldo_anterior) - Number(activo.rendimientos_netos)) > 0.02)
  return { registros, ganancias, saldoInicial, saldoFinal, porcentaje, faltantes, ajustes }
}
