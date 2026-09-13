import { strict as assert } from 'node:assert'
import { createMemoryFileInput } from './browser-input'
import { createDefaultFormatAdapterRegistry } from './default-registry'
import { createPlanningBoundary } from './planning-boundary'
import { createProcessingBoundary } from './processing-boundary'

const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const text = (value: string) => [...new TextEncoder().encode(value)]
const source = new Uint8Array([0xff, 0xd8, ...segment(0xfe, text('remove')), ...segment(0xfe, text('keep')), ...segment(0xe1, [...text('Exif\0\0'), 0x49, 0x49]), ...segment(0xe2, [...text('ICC_PROFILE\0'), 1]), ...segment(0xe3, [9, 8]), ...segment(0xc0, [1, 2, 3]), 0xff, 0xd9])

async function test(name: string, fn: () => void | Promise<void>) { await fn(); console.log(`PASS ${name}`) }
async function makePlan(input: ReturnType<typeof createMemoryFileInput>) {
  const boundary = createPlanningBoundary(createDefaultFormatAdapterRegistry())
  const result = await boundary.planRemoval({ input, fieldIds: ['jpeg-comment-0'], policy: 'quick' })
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('plan failed')
  return result.value
}
async function main() {
  await test('removes only approved COM and preserves all other bytes', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-1', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const result = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(result.ok, true, result.ok ? '' : result.error.message)
    if (result.ok && result.value.output) {
      const artifact = result.value.output.artifact
      assert.notEqual(artifact.id, input.descriptor.id)
      assert.equal(result.value.outputVerification, 'passed')
      const checks = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).verify(input)
      assert.equal(checks.ok, false)
      const output = await artifact.read()
      assert.equal(output.ok, true)
      if (output.ok) {
        const expected = new Uint8Array([0xff, 0xd8, ...segment(0xfe, text('keep')), ...segment(0xe1, [...text('Exif\0\0'), 0x49, 0x49]), ...segment(0xe2, [...text('ICC_PROFILE\0'), 1]), ...segment(0xe3, [9, 8]), ...segment(0xc0, [1, 2, 3]), 0xff, 0xd9])
        assert.deepEqual([...output.value], [...expected])
        output.value[0] = 0
        const reread = await artifact.read()
        assert.equal(reread.ok, true)
        if (reread.ok) assert.equal(reread.value[0], 0xff)
      }
      artifact.dispose(); artifact.dispose()
      assert.equal((await artifact.read()).ok, false)
    } else assert.fail('missing output artifact')
    const original = await input.read()
    assert.equal(original.ok, true)
    if (original.ok) assert.deepEqual([...original.value], [...source])
  })
  await test('removes multiple approved COM segments and leaves unapproved COM', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-2', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const result = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, approvedTargetIds: ['jpeg-comment-0', 'jpeg-comment-1'], approvedAt: 1 } })
    assert.equal(result.ok, false)
    const onePlan = { ...plan, removableTargetIds: ['jpeg-comment-0', 'jpeg-comment-1'] }
    const execute = await boundary.execute({ operation: 'remove', input, plan: onePlan, approval: { planId: onePlan.id, inputId: input.descriptor.id, approvedTargetIds: ['jpeg-comment-0', 'jpeg-comment-1'], approvedAt: 1 } })
    assert.equal(execute.ok, true)
  })
  await test('rejects invalid approvals and cancellation without output', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-3', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const invalid = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: 'wrong', inputId: input.descriptor.id, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(invalid.ok, false)
    const controller = new AbortController(); controller.abort()
    const cancelled = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } }, { signal: controller.signal })
    assert.equal(cancelled.ok, false)
    if (!cancelled.ok) assert.equal(cancelled.error.code, 'CANCELLED')
  })
  await test('rejects protected targets and malformed input', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-4', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const protectedPlan = { ...plan, removableTargetIds: ['jpeg-icc-0'] }
    const protectedResult = await boundary.execute({ operation: 'remove', input, plan: protectedPlan, approval: { planId: plan.id, inputId: input.descriptor.id, approvedTargetIds: ['jpeg-icc-0'], approvedAt: 1 } })
    assert.equal(protectedResult.ok, false)
    const malformedInput = createMemoryFileInput(new Uint8Array([0xff, 0xd8]), { id: 'bad', filename: 'bad.jpg' })
    const malformedPlan = await makePlan(malformedInput).catch(() => undefined)
    assert.equal(malformedPlan, undefined)
  })
  console.log('COM execution tests passed: 4')
}
void main()
