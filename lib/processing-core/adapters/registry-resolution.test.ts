import { strict as assert } from 'node:assert'
import { createFormatAdapterRegistry } from './registry'
import { createMemoryInput } from '../domain/input'

async function main() {
const input = createMemoryInput(new Uint8Array([0xff, 0xd8]), { id: 'probe', filename: 'wrong.png', mimeType: 'image/png' })
const registry = createFormatAdapterRegistry()
let probed = 0
registry.register({ id: 'probe-transformer', role: 'transformer', formatId: 'jpeg', engineId: 'e', engineVersion: '1', capabilityKey: 'jpeg:remove-com', verifierCompatibilityKey: 'v1', probe: async () => { probed++; return { ok: true, value: { formatId: 'jpeg', mediaType: 'image/jpeg', confidence: 'structural' } } }, capability: { extensions: ['jpg'], mimeTypes: ['image/jpeg'], operations: ['remove'] }, remove: async () => ({ ok: false, error: { code: 'UNSUPPORTED', message: 'not called' } }) })
const resolved = await registry.resolveVerified(input, 'remove')
assert.equal(resolved.ok, true)
assert.equal(probed, 1)
const ambiguous = createFormatAdapterRegistry()
const base = { role: 'verifier' as const, formatId: 'jpeg', engineId: 'e', engineVersion: '1', capabilityKey: 'jpeg:verify', verifierCompatibilityKey: 'v1', probe: async () => ({ ok: true as const, value: { formatId: 'jpeg', mediaType: 'image/jpeg', confidence: 'structural' as const } }), capability: { extensions: ['jpg'], mimeTypes: ['image/jpeg'], operations: ['verify'] as const }, verifyOutput: async () => ({ ok: false as const, error: { code: 'VERIFICATION_FAILED' as const, message: 'not called' } }) }
ambiguous.register({ ...base, id: 'v-a' }); ambiguous.register({ ...base, id: 'v-b' })
const ambiguousResult = await ambiguous.resolveVerifiedVerifier(input, 'executor', 'v1')
assert.equal(ambiguousResult.ok, false); if (!ambiguousResult.ok) assert.equal(ambiguousResult.error.code, 'UNSUPPORTED')
console.log('Content-probed resolver tests passed: 3')
}
void main()
