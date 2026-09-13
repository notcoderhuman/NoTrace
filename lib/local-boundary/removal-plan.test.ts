import { strict as assert } from 'node:assert'
import { createMemoryFileInput } from './browser-input'
import { createDefaultFormatAdapterRegistry } from './default-registry'
import { createPlanningBoundary } from './planning-boundary'

const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const text = (value: string) => [...new TextEncoder().encode(value)]
const bytes = new Uint8Array([0xff, 0xd8, ...segment(0xfe, text('one')), ...segment(0xfe, text('two')), ...segment(0xe1, [...text('Exif\0\0'), 0x49, 0x49]), ...segment(0xe2, [...text('ICC_PROFILE\0'), 1]), 0xff, 0xd9])

async function test(name: string, fn: () => void | Promise<void>) { await fn(); console.log(`PASS ${name}`) }
async function main() {
  await test('plans only requested COM targets and preserves everything else', async () => {
    const input = createMemoryFileInput(bytes, { id: 'input-1', filename: 'photo.jpg' })
    const boundary = createPlanningBoundary(createDefaultFormatAdapterRegistry())
    const plan = await boundary.planRemoval({ input, fieldIds: ['jpeg-comment-0'], policy: 'quick' })
    assert.equal(plan.ok, true)
    if (plan.ok) {
      assert.equal(plan.value.status, 'ready')
      assert.deepEqual(plan.value.removableTargetIds, ['jpeg-comment-0'])
      assert.deepEqual(plan.value.preservedTargetIds, ['jpeg-comment-1', 'jpeg-exif-0', 'jpeg-icc-0'])
      assert.equal(plan.value.requiresApproval, true)
    }
  })
  await test('planning is deterministic and never reads output or changes input', async () => {
    const boundary = createPlanningBoundary(createDefaultFormatAdapterRegistry())
    const firstInput = createMemoryFileInput(bytes, { id: 'input-2', filename: 'photo.jpg' })
    const secondInput = createMemoryFileInput(bytes, { id: 'input-2', filename: 'photo.jpg' })
    const first = await boundary.planRemoval({ input: firstInput, fieldIds: [], policy: 'quick' })
    const second = await boundary.planRemoval({ input: secondInput, fieldIds: [], policy: 'quick' })
    assert.equal(first.ok, true); assert.equal(second.ok, true)
    if (first.ok && second.ok) assert.deepEqual(first.value, second.value)
    const unchanged = await firstInput.read()
    assert.equal(unchanged.ok, true)
    if (unchanged.ok) assert.deepEqual([...unchanged.value], [...bytes])
  })
  await test('unknown, protected, and malformed targets are not authorized', async () => {
    const boundary = createPlanningBoundary(createDefaultFormatAdapterRegistry())
    const plan = await boundary.planRemoval({ input: createMemoryFileInput(bytes, { id: 'input-3', filename: 'photo.jpg' }), fieldIds: ['jpeg-icc-0', 'jpeg-unknown-0', 'missing'], policy: 'quick' })
    assert.equal(plan.ok, true)
    if (plan.ok) { assert.deepEqual(plan.value.removableTargetIds, []); assert.equal(plan.value.warnings.length > 0, true) }
    const malformed = await boundary.planRemoval({ input: createMemoryFileInput(new Uint8Array([0xff, 0xd8]), { id: 'bad', filename: 'bad.jpg' }), fieldIds: [], policy: 'quick' })
    assert.equal(malformed.ok, false)
  })
  console.log('Removal planning tests passed: 3')
}
void main()
