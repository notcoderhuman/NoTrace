import { strict as assert } from 'node:assert'
import { createFormatAdapterRegistry } from './registry'
import { createMemoryInput } from '../domain/input'

async function main() {
const input = createMemoryInput(new Uint8Array([0xff, 0xd8]), { id: 'probe', filename: 'wrong.png', mimeType: 'image/png' })
const registry = createFormatAdapterRegistry()
let probed = 0
const legacy = { id: 'probe-transformer', role: 'transformer' as const, formatId: 'jpeg', engineId: 'e', engineVersion: '1', capabilityKey: 'jpeg:remove-com', verifierCompatibilityKey: 'v1', probe: async () => { probed++; return { ok: true as const, value: { formatId: 'jpeg', mediaType: 'image/jpeg', confidence: 'structural' as const } } }, capability: { extensions: ['jpg'], mimeTypes: ['image/jpeg'], operations: ['inspect'] as const }, inspect: async () => ({ ok: false as const, error: { code: 'UNSUPPORTED' as const, message: 'not called' } }) }
registry.register(legacy)
const resolved = await registry.resolveVerified(input, 'inspect')
assert.equal(resolved.ok, true)
const rejected = registry.register({ ...legacy, id: 'contractless-destructive', capability: { ...legacy.capability, operations: ['remove'] as const }, remove: async () => ({ ok: false as const, error: { code: 'UNSUPPORTED' as const, message: 'not called' } }) })
assert.equal(rejected.ok, false)
assert.equal(probed, 1)
const ambiguous = createFormatAdapterRegistry()
const base = { role: 'verifier' as const, formatId: 'jpeg', engineId: 'e', engineVersion: '1', capabilityKey: 'jpeg:verify', verifierCompatibilityKey: 'v1', probe: async () => ({ ok: true as const, value: { formatId: 'jpeg', mediaType: 'image/jpeg', confidence: 'structural' as const } }), capability: { extensions: ['jpg'], mimeTypes: ['image/jpeg'], operations: ['verify'] as const }, verifyOutput: async () => ({ ok: false as const, error: { code: 'VERIFICATION_FAILED' as const, message: 'not called' } }) }
const verifierDeclaration = { formatId: 'jpeg', operations: ['verifyRemoval'] as const, extensions: ['jpg'], mimeTypes: ['image/jpeg'], verifierCompatibilityKey: 'v1' }
const verifierConformance = { level: 'verification-capable' as const, declaration: verifierDeclaration, resource: { inputBound: { maxBytes: 1, state: 'measured' as const }, fullBufferOperations: { state: 'inferred' as const }, streaming: { supported: false, state: 'measured' as const }, worker: { required: false, state: 'measured' as const }, transfer: { transferable: false, copies: true, state: 'inferred' as const }, temporaryAllocations: 'inferred' as const, concurrency: { state: 'unmeasured' as const }, cancellationPoints: [] }, independentVerifier: true as const }
ambiguous.register({ ...base, id: 'v-a', conformance: verifierConformance, contract: { conformance: verifierConformance } })
ambiguous.register({ ...base, id: 'v-b', conformance: verifierConformance, contract: { conformance: verifierConformance } })
const ambiguousResult = await ambiguous.resolveVerifiedVerifier(input, 'executor', 'v1')
assert.equal(ambiguousResult.ok, false); if (!ambiguousResult.ok) assert.equal(ambiguousResult.error.code, 'UNSUPPORTED')
console.log('Content-probed resolver tests passed: 3')
}
void main()
