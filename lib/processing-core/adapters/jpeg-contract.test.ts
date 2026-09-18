import { strict as assert } from 'node:assert'
import { createMemoryInput } from '../domain/input'
import { jpegAdapter, jpegCapabilityDeclaration, jpegConformance, jpegContract, jpegEvidenceFromInspection, inspectJpegStructure, inspectJpeg } from './jpeg'

const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const frame = [0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0]
const scan = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0]
const bytes = new Uint8Array([0xff, 0xd8, ...frame, ...segment(0xfe, [0x6f, 0x6b]), ...scan, 0x11, 0xff, 0xd9])
const input = createMemoryInput(bytes, { id: 'golden', filename: 'golden.jpg', mimeType: 'image/jpeg' })
const context = { input, descriptor: input.descriptor, identity: jpegCapabilityDeclaration.processingIdentity }

async function main() {
assert.deepEqual(jpegCapabilityDeclaration.operations, ['inspect', 'planRemoval', 'executeRemoval', 'verifyRemoval'])
assert.equal(jpegConformance.level, 'verification-capable')
assert.equal(jpegConformance.independentVerifier, true)
assert.equal(jpegAdapter.contract, jpegContract)
assert.equal(jpegAdapter.evidence, jpegEvidenceFromInspection)
assert.equal(jpegContract.conformance, jpegConformance)

const inventory = await inspectJpegStructure(input)
assert.equal(inventory.ok, true)
if (inventory.ok) {
  const target = inventory.value.segments.find(segmentValue => segmentValue.target?.category === 'comment')?.target
  assert.ok(target)
  const inspection = await jpegContract.inspect?.(context)
  assert.equal(inspection?.ok, true)
  assert.equal((await inspectJpeg(input)).ok, true)
  if (inspection?.ok) {
    const evidence = jpegEvidenceFromInspection(inspection.value)
    assert.ok(evidence.some(item => item.state === 'detected'))
    assert.ok(evidence.every(item => item.source === 'local-inspection'))
  }
  const planResult = await jpegContract.planRemoval?.(context, [target.id])
  assert.equal(planResult?.ok, true)
  if (planResult?.ok) {
    assert.deepEqual(planResult.value.removableTargetIds, [target.id])
    assert.equal(planResult.value.sourceFingerprint, inventory.value.sourceFingerprint)
    assert.equal(planResult.value.removalWitnesses[0]?.targetId, target.id)
  }
}

const controller = new AbortController()
controller.abort()
const cancelled = await jpegContract.inspect?.({ ...context, signal: controller.signal })
assert.equal(cancelled?.ok, false)
if (cancelled && !cancelled.ok) assert.equal(cancelled.error.code, 'CANCELLED')

console.log('JPEG golden adapter contract passed: 10')
}

void main()
