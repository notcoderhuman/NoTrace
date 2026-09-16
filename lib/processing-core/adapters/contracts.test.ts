import { strict as assert } from 'node:assert'
import { createEngineCapabilityRegistry, type EngineContract } from './contracts'
import { createDescriptorInput } from '../domain/input'

const input = createDescriptorInput({ id: 'architecture', filename: 'photo.jpg', mimeType: 'image/jpeg', source: 'opaque', size: 1 })
const context = { limits: { maxInputBytes: 32 * 1024 * 1024, maxOutputBytes: 32 * 1024 * 1024 }, localOnly: true as const }
const inspection = { id: 'jpeg-inspector', capability: 'jpeg:inspect' as const, inspect: async () => ({ ok: false as const, error: { code: 'UNSUPPORTED' as const, message: 'test' } }) }
const transformation = { id: 'jpeg-transformer', capability: 'jpeg:transform' as const, transform: async () => ({ ok: false as const, error: { code: 'UNSUPPORTED' as const, message: 'test' } }) }
const verifier = { id: 'jpeg-verifier', capability: 'jpeg:verify' as const, independence: 'structural-independent' as const, verify: async () => ({ ok: false as const, error: { code: 'UNSUPPORTED' as const, message: 'test' } }) }

function test(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

test('registers explicit inspection, transformation, and verification capabilities', () => {
  const registry = createEngineCapabilityRegistry()
  const engine: EngineContract = { format: 'jpeg', inspection, transformation, verifier }
  assert.equal(registry.register(engine).ok, true)
  assert.equal(registry.resolve('jpeg', 'inspect').ok, true)
  assert.equal(registry.resolve('jpeg', 'transform').ok, true)
  assert.equal(registry.resolve('jpeg', 'verify').ok, true)
  assert.equal(registry.list().length, 1)
  void input
  void context
})

test('rejects unsupported capabilities and duplicate formats', () => {
  const registry = createEngineCapabilityRegistry()
  assert.equal(registry.resolve('png', 'inspect').ok, false)
  assert.equal(registry.register({ format: 'jpeg', inspection }).ok, true)
  assert.equal(registry.register({ format: 'jpeg', verifier }).ok, false)
  assert.equal(registry.resolve('jpeg', 'transform').ok, false)
})

test('rejects malformed or cross-format capability identities', () => {
  const registry = createEngineCapabilityRegistry()
  assert.equal(registry.register({ format: '', inspection }).ok, false)
  assert.equal(registry.register({ format: 'png', inspection }).ok, false)
  assert.equal(registry.register({ format: 'png' }).ok, false)
})

test('capability context is NoTrace-owned and local-only', () => {
  assert.equal(context.localOnly, true)
  assert.equal(context.limits.maxInputBytes, 32 * 1024 * 1024)
  assert.equal(typeof inspection.inspect, 'function')
  assert.equal(typeof transformation.transform, 'function')
  assert.equal(typeof verifier.verify, 'function')
})
