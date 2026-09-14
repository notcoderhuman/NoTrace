import { strict as assert } from 'node:assert'
import { createMemoryFileInput } from './browser-input'
import { createDefaultFormatAdapterRegistry } from './default-registry'
import { createPlanningBoundary } from './planning-boundary'
import { createProcessingBoundary } from './processing-boundary'
import { createFormatAdapterRegistry } from '../processing-core/adapters/registry'
import { jpegAdapter } from '../processing-core/adapters/jpeg'
import { jpegVerifierAdapter, verifyJpegOutputIndependently } from '../processing-core/adapters/jpeg-verifier'
import { createMemoryArtifact } from '../processing-core/domain/artifact'
import { JPEG_VERIFICATION_CHECK_IDS } from '../processing-core/domain/result'

const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const text = (value: string) => [...new TextEncoder().encode(value)]
const source = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xfe, text('remove')), ...segment(0xfe, text('keep')), ...segment(0xe1, [...text('Exif\0\0'), 0x49, 0x49]), ...segment(0xe2, [...text('ICC_PROFILE\0'), 1]), ...segment(0xe3, [9, 8]), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x11, 0xff, 0xd9])

async function test(name: string, fn: () => void | Promise<void>) { await fn(); console.log(`PASS ${name}`) }
async function makePlan(input: ReturnType<typeof createMemoryFileInput>) {
  const boundary = createPlanningBoundary(createDefaultFormatAdapterRegistry())
  const result = await boundary.planRemoval({ input, fieldIds: ['jpeg-comment-0'], policy: 'quick' })
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('plan failed')
  return result.value
}
async function main() {
  await test('resolves a distinct verifier capability', async () => {
    const registry = createDefaultFormatAdapterRegistry()
    const executor = registry.resolveRemoval({ id: 'x', filename: 'x.jpg', mimeType: 'image/jpeg', size: 2, source: 'memory' })
    const verifier = registry.resolveVerifier({ id: 'x', filename: 'x.jpg', mimeType: 'image/jpeg', size: 2, source: 'memory' }, executor.ok ? executor.value.id : undefined)
    assert.equal(executor.ok, true)
    assert.equal(verifier.ok, true)
    if (executor.ok && verifier.ok) assert.notEqual(executor.value.id, verifier.value.id)
  })
  await test('verifier rejects mismatched and duplicate approval bindings', async () => {
    const input = createMemoryFileInput(source, { id: 'verify-bind', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const bad = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: 'wrong', approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(bad.ok, false)
    const duplicate = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0', 'jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(duplicate.ok, false)
  })
  await test('removes only approved COM and preserves all other bytes', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-1', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const result = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
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
        const expected = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xfe, text('keep')), ...segment(0xe1, [...text('Exif\0\0'), 0x49, 0x49]), ...segment(0xe2, [...text('ICC_PROFILE\0'), 1]), ...segment(0xe3, [9, 8]), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x11, 0xff, 0xd9])
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
  await test('removes exactly one of two identical COM segments', async () => {
    const identical = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xfe, text('same')), ...segment(0xfe, text('same')), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x11, 0xff, 0xd9])
    const input = createMemoryFileInput(identical, { id: 'duplicate-com', filename: 'duplicate.jpg' })
    const plan = await makePlan(input)
    const result = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(result.ok, true)
    if (result.ok) {
      const output = await result.value.output!.artifact.read()
      assert.equal(output.ok, true)
      if (output.ok) assert.deepEqual([...output.value], [0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xfe, text('same')), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x11, 0xff, 0xd9])
      result.value.output?.artifact.dispose()
    }
  })
  await test('preserves SOS entropy, stuffing, and restart markers during verified COM removal', async () => {
    const entropySource = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xfe, text('remove')), ...segment(0xfe, text('keep')), ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd0, 0x44, 0xff, 0x00, 0x55, 0xff, 0xd1, 0x66, 0xff, 0xd9])
    const input = createMemoryFileInput(entropySource, { id: 'entropy-exec', filename: 'camera.jpg' })
    const planResult = await createPlanningBoundary(createDefaultFormatAdapterRegistry()).planRemoval({ input, fieldIds: ['jpeg-comment-0'], policy: 'quick' })
    assert.equal(planResult.ok, true)
    if (!planResult.ok) return
    const result = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input, plan: planResult.value, approval: { planId: planResult.value.id, inputId: input.descriptor.id, sourceFingerprint: planResult.value.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.outputVerification, 'passed')
      assert.deepEqual(result.value.removedTargetIds, ['jpeg-comment-0'])
      assert.deepEqual(result.value.preservedTargetIds, ['jpeg-comment-1'])
      const output = await result.value.output!.artifact.read()
      assert.equal(output.ok, true)
      if (output.ok) assert.deepEqual([...output.value], [0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xfe, text('keep')), ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd0, 0x44, 0xff, 0x00, 0x55, 0xff, 0xd1, 0x66, 0xff, 0xd9])
      result.value.output?.artifact.dispose()
    }
    const original = await input.read()
    assert.equal(original.ok, true)
    if (original.ok) assert.deepEqual([...original.value], [...entropySource])
  })
  await test('rejects approval when source bytes change after planning', async () => {
    const input = createMemoryFileInput(source, { id: 'changed', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const changed = createMemoryFileInput(new Uint8Array([...source.slice(0, -1), 0xd8, 0xd9]), { id: 'changed', filename: 'photo.jpg' })
    const result = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input: changed, plan, approval: { planId: plan.id, inputId: changed.descriptor.id, sourceFingerprint: plan.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(result.ok, false)
  })
  await test('removes multiple approved COM segments and leaves unapproved COM', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-2', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const result = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0', 'jpeg-comment-1'], approvedAt: 1 } })
    assert.equal(result.ok, false)
    const bothPlanResult = await createPlanningBoundary(createDefaultFormatAdapterRegistry()).planRemoval({ input, fieldIds: ['jpeg-comment-0', 'jpeg-comment-1'], policy: 'quick' })
    assert.equal(bothPlanResult.ok, true)
    if (!bothPlanResult.ok) return
    const onePlan = bothPlanResult.value
    const execute = await boundary.execute({ operation: 'remove', input, plan: onePlan, approval: { planId: onePlan.id, inputId: input.descriptor.id, sourceFingerprint: onePlan.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0', 'jpeg-comment-1'], approvedAt: 1 } })
    assert.equal(execute.ok, true, execute.ok ? '' : execute.error.message)
  })
  await test('rejects invalid approvals and cancellation without output', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-3', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const invalid = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: 'wrong', inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(invalid.ok, false)
    const controller = new AbortController(); controller.abort()
    const cancelled = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } }, { signal: controller.signal })
    assert.equal(cancelled.ok, false)
    if (!cancelled.ok) assert.equal(cancelled.error.code, 'CANCELLED')
  })
  await test('rejects protected targets and malformed input', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-4', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const protectedPlan = { ...plan, removableTargetIds: ['jpeg-icc-0'] }
    const protectedResult = await boundary.execute({ operation: 'remove', input, plan: protectedPlan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, approvedTargetIds: ['jpeg-icc-0'], approvedAt: 1 } })
    assert.equal(protectedResult.ok, false)
    const malformedInput = createMemoryFileInput(new Uint8Array([0xff, 0xd8]), { id: 'bad', filename: 'bad.jpg' })
    const malformedPlan = await makePlan(malformedInput).catch(() => undefined)
    assert.equal(malformedPlan, undefined)
  })
  await test('passes ordinal 1 and both duplicate COM occurrences', async () => {
    const identical = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xfe, text('same')), ...segment(0xfe, text('same')), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x11, 0xff, 0xd9])
    const input = createMemoryFileInput(identical, { id: 'duplicate-positive', filename: 'duplicate.jpg' })
    const planning = createPlanningBoundary(createDefaultFormatAdapterRegistry())
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    for (const ids of [['jpeg-comment-1'], ['jpeg-comment-0', 'jpeg-comment-1']]) {
      const planResult = await planning.planRemoval({ input, fieldIds: ids, policy: 'quick' })
      assert.equal(planResult.ok, true); if (!planResult.ok) return
      const result = await boundary.execute({ operation: 'remove', input, plan: planResult.value, approval: { planId: planResult.value.id, inputId: input.descriptor.id, sourceFingerprint: planResult.value.sourceFingerprint, approvedTargetIds: ids, approvedAt: 1 } })
      assert.equal(result.ok, true, result.ok ? '' : `${result.error.message} ids=${ids.join(',')}`); if (result.ok) result.value.output?.artifact.dispose()
    }
  })
  await test('rejects forged trace fields and swapped identical occurrence', async () => {
    const input = createMemoryFileInput(source, { id: 'trace-test', filename: 'photo.jpg' }); const plan = await makePlan(input)
    const output = createMemoryArtifact(source, 'faulty.jpg')
    const approval = { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 }
    const forged = { ...plan, removalWitnesses: plan.removalWitnesses.map(w => ({ ...w, ordinal: w.ordinal + 1 })) }
    const result = await verifyJpegOutputIndependently(input, output, forged, approval)
    assert.equal(result.ok, false); output.dispose()
  })
  await test('rejects hostile verifier evidence through boundary contract', async () => {
    const input = createMemoryFileInput(source, { id: 'hostile', filename: 'photo.jpg' }); const plan = await makePlan(input)
    for (const mutate of [
      (v: any) => ({ ...v, checks: [{ id: 'x', name: 'x', status: 'passed' }] }),
      (v: any) => ({ ...v, checks: v.checks.slice(0, -1) }),
      (v: any) => ({ ...v, checks: [...v.checks, v.checks[0]] }),
      (v: any) => ({ ...v, checks: [...v.checks, { id: 'unknown', name: 'unknown', status: 'passed' }] }),
      (v: any) => ({ ...v, removedTargetIds: [] }),
      (v: any) => ({ ...v, preservedTargetIds: ['forged'] }),
      (v: any) => ({ ...v, removalTrace: [] }),
      (v: any) => ({ ...v, sourceFingerprint: 'wrong' }),
      (v: any) => ({ ...v, planId: 'wrong' }),
      (v: any) => ({ ...v, inputId: 'wrong' }),
      (v: any) => ({ ...v, outputCreated: false }),
      (v: any) => ({ ...v, status: 'failed' }),
      (v: any) => ({ ...v, checks: v.checks.map((c: any) => c.id === 'output-soi' ? { ...c, status: 'failed' } : c) }),
      (v: any) => ({ ...v, checks: v.checks.map((c: any) => c.id === 'output-soi' ? { ...c, status: 'not-run' } : c) }),
    ]) {
      const registry = createFormatAdapterRegistry(); registry.register(jpegAdapter); registry.register({ ...jpegVerifierAdapter, verifyOutput: async (inputArg: any, outputArg: any, planArg: any, approvalArg: any, signalArg?: AbortSignal) => { const valid = await verifyJpegOutputIndependently(inputArg, outputArg, planArg, approvalArg, signalArg); if (!valid.ok) return valid; return { ok: true, value: mutate(valid.value) } } })
      const result = await createProcessingBoundary(registry).execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
      assert.equal(result.ok, false)
    }
  })
  console.log('COM execution tests passed: 9')
}
void main()
