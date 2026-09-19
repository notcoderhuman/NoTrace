import { strict as assert } from 'node:assert'
import { createMemoryInput } from '../domain/input'
import { createMemoryArtifact } from '../domain/artifact'
import { executePngRemoval, planPngRemoval, PNG_SIGNATURE } from './png'
import { verifyPngOutputIndependently } from './png-verifier'

function crc(bytes: Uint8Array) { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0) }; return (c ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: number[]) { const t = new TextEncoder().encode(type); const body = new Uint8Array([...t, ...data]); const out = new Uint8Array(12 + data.length); new DataView(out.buffer).setUint32(0, data.length); out.set(t, 4); out.set(data, 8); new DataView(out.buffer).setUint32(8 + data.length, crc(body)); return [...out] }
const fixture = new Uint8Array([...PNG_SIGNATURE, ...chunk('IHDR', [0,0,0,1,0,0,0,1,8,2,0,0,0]), ...chunk('tEXt', [...new TextEncoder().encode('Comment'), 0, 1,2,3]), ...chunk('tEXt', [...new TextEncoder().encode('Author'), 0, 4,5]), ...chunk('IDAT', [0,0,0,0]), ...chunk('IEND', [])])
async function main() {
  const input = createMemoryInput(fixture, { id: 'png-verifier', filename: 'fixture.png', mimeType: 'image/png' })
  const scannedPlan = await planPngRemoval(input, ['png-tEXt-0'], 'png-text'); assert.equal(scannedPlan.ok, true); if (!scannedPlan.ok) return
  const plan = scannedPlan.value
  const approval = { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['png-tEXt-0'], approvedAt: 1 }
  const execution = await executePngRemoval(input, plan, approval); assert.equal(execution.ok, true); if (!execution.ok || !execution.value.output) return
  const verified = await verifyPngOutputIndependently(input, execution.value.output.artifact, plan, approval); assert.equal(verified.ok, true)
  const forged = await verifyPngOutputIndependently(input, execution.value.output.artifact, { ...plan, sourceFingerprint: 'forged' }, { ...approval, sourceFingerprint: 'forged' }); assert.equal(forged.ok, false)
  const altered = createMemoryArtifact(new Uint8Array([...fixture]), 'altered.png', 'image/png')
  const alteredResult = await verifyPngOutputIndependently(input, altered, plan, approval); assert.equal(alteredResult.ok, false)
  console.log('PNG independent verifier tests passed: 3')
}
void main()
