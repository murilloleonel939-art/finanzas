import assert from 'node:assert/strict'
import { proveedoresPorTipo, tipoDeProveedor, resolverNombreProveedor, WALLET_PROVIDERS } from '../src/lib/walletProviders.js'
import { saldosPorMoneda, analizarWallet } from '../src/lib/wallets-datos.js'

assert.ok(WALLET_PROVIDERS.length > 0)
assert.equal(proveedoresPorTipo().length, WALLET_PROVIDERS.length)
assert.equal(tipoDeProveedor('COINDEPO'), 'ambos')
assert.equal(resolverNombreProveedor('__otro__', ' Mi Wallet '), 'Mi Wallet')
assert.deepEqual(saldosPorMoneda([{ tipo_moneda: 'BTC', tipo: 'ingreso', monto: 1 }, { tipo_moneda: 'BTC', tipo: 'ingreso', monto: 2 }]), [{ moneda: 'BTC', monto: 3 }])
assert.equal(analizarWallet([], []).apertura.length, 0)
console.log('✅ Wallets local: catálogo y cálculos OK')
