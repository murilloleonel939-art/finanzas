import assert from 'node:assert/strict'
import { brokersPorTipo, brokerDelCatalogo, monedaSugerida, resolverNombreBroker, BROKERS } from '../src/lib/brokers.js'
import { hoyLocal } from '../src/lib/utils.js'

assert.ok(BROKERS.length > 0)
assert.equal(new Set(BROKERS.map((broker) => broker.nombre)).size, BROKERS.length)
assert.ok(brokersPorTipo().length > 0)
assert.equal(brokerDelCatalogo('eToro').nombre, 'eToro')
assert.equal(brokerDelCatalogo('NoExiste'), null)
assert.equal(monedaSugerida('Trii'), 'COP')
assert.equal(resolverNombreBroker('__otro__', ' Mi Broker '), 'Mi Broker')
assert.match(hoyLocal(), /^\d{4}-\d{2}-\d{2}$/)
console.log('✅ Brokers local: catálogo y utilidades OK')
