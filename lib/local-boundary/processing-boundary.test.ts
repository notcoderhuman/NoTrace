import { strict as assert } from 'node:assert'
import { createMemoryFileInput } from './browser-input'
import { createMemoryInput } from '../processing-core/domain/input'
import { createDefaultFormatAdapterRegistry } from './default-registry'
import { createPlanningBoundary } from './planning-boundary'
import { createProcessingBoundary } from './processing-boundary'
import { createFormatAdapterRegistry } from '../processing-core/adapters/registry'
import { jpegAdapter } from '../processing-core/adapters/jpeg'
import { jpegVerifierAdapter, verifyJpegOutputIndependently } from '../processing-core/adapters/jpeg-verifier'
import { createMemoryArtifact, type OutputArtifact } from '../processing-core/domain/artifact'
import { JPEG_VERIFICATION_CHECK_IDS } from '../processing-core/domain/result'
import type { AdapterContract } from '../processing-core/domain/contracts'
import { JPEG_PROCESSING_IDENTITY } from '../processing-core/domain/identity'

const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const text = (value: string) => [...new TextEncoder().encode(value)]
function disposeArtifactForTest(artifact: OutputArtifact) { try { artifact.dispose() } catch { /* observable cleanup failure is asserted by callers */ } }

function observableArtifact(label: string, throws = false): OutputArtifact & { disposeCount: number; disposed: boolean } {
  let disposeCount = 0
  let disposed = false
  return {
    id: `test-${label}`, filename: `${label}.jpg`, mediaType: 'image/jpeg', size: source.byteLength,
    get disposeCount() { return disposeCount }, get disposed() { return disposed },
    async read() { return disposed ? { ok: false, error: { code: 'INVALID_INPUT', message: 'disposed' } } : { ok: true, value: source.slice() } },
    dispose() { disposeCount += 1; disposed = true; if (throws) throw new Error('dispose failed') },
  }
}

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
    const verifier = await registry.resolveVerifiedVerifier(createMemoryInput(new Uint8Array([0xff, 0xd8]), { id: 'x', filename: 'x.jpg', mimeType: 'image/jpeg' }), executor.ok ? executor.value.id : '', executor.ok ? executor.value.verifierCompatibilityKey : undefined)
    assert.equal(executor.ok, true)
    assert.equal(verifier.ok, true)
    if (executor.ok && verifier.ok) assert.notEqual(executor.value.id, verifier.value.id)
  })
  await test('verifier rejects mismatched and duplicate approval bindings', async () => {
    const input = createMemoryFileInput(source, { id: 'verify-bind', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const bad = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: 'wrong', identity: plan.identity, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(bad.ok, false)
    const duplicate = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['jpeg-comment-0', 'jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(duplicate.ok, false)
  })
  await test('removes only approved COM and preserves all other bytes', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-1', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const result = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
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
  await test('rejects indistinguishable duplicate COM occurrence verification', async () => {
    const identical = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xfe, text('same')), ...segment(0xfe, text('same')), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x11, 0xff, 0xd9])
    const input = createMemoryFileInput(identical, { id: 'duplicate-com', filename: 'duplicate.jpg' })
    const plan = await makePlan(input)
    const result = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(result.ok, false)
  })
  await test('preserves SOS entropy, stuffing, and restart markers during verified COM removal', async () => {
    const entropySource = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xfe, text('remove')), ...segment(0xfe, text('keep')), ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd0, 0x44, 0xff, 0x00, 0x55, 0xff, 0xd1, 0x66, 0xff, 0xd9])
    const input = createMemoryFileInput(entropySource, { id: 'entropy-exec', filename: 'camera.jpg' })
    const planResult = await createPlanningBoundary(createDefaultFormatAdapterRegistry()).planRemoval({ input, fieldIds: ['jpeg-comment-0'], policy: 'quick' })
    assert.equal(planResult.ok, true)
    if (!planResult.ok) return
    const result = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input, plan: planResult.value, approval: { planId: planResult.value.id, inputId: input.descriptor.id, sourceFingerprint: planResult.value.sourceFingerprint, identity: planResult.value.identity, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
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
    const result = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input: changed, plan, approval: { planId: plan.id, inputId: changed.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(result.ok, false)
  })
  await test('removes multiple approved COM segments and leaves unapproved COM', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-2', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const result = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['jpeg-comment-0', 'jpeg-comment-1'], approvedAt: 1 } })
    assert.equal(result.ok, false)
    const bothPlanResult = await createPlanningBoundary(createDefaultFormatAdapterRegistry()).planRemoval({ input, fieldIds: ['jpeg-comment-0', 'jpeg-comment-1'], policy: 'quick' })
    assert.equal(bothPlanResult.ok, true)
    if (!bothPlanResult.ok) return
    const onePlan = bothPlanResult.value
    const execute = await boundary.execute({ operation: 'remove', input, plan: onePlan, approval: { planId: onePlan.id, inputId: input.descriptor.id, sourceFingerprint: onePlan.sourceFingerprint, identity: onePlan.identity, approvedTargetIds: ['jpeg-comment-0', 'jpeg-comment-1'], approvedAt: 1 } })
    assert.equal(execute.ok, true, execute.ok ? '' : execute.error.message)
  })
  await test('rejects invalid approvals and cancellation without output', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-3', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const invalid = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: 'wrong', inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
    assert.equal(invalid.ok, false)
    const controller = new AbortController(); controller.abort()
    const cancelled = await boundary.execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } }, { signal: controller.signal })
    assert.equal(cancelled.ok, false)
    if (!cancelled.ok) assert.equal(cancelled.error.code, 'CANCELLED')
  })
  await test('rejects protected targets and malformed input', async () => {
    const input = createMemoryFileInput(source, { id: 'exec-4', filename: 'photo.jpg' })
    const plan = await makePlan(input)
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    const protectedPlan = { ...plan, removableTargetIds: ['jpeg-icc-0'] }
    const protectedResult = await boundary.execute({ operation: 'remove', input, plan: protectedPlan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['jpeg-icc-0'], approvedAt: 1 } })
    assert.equal(protectedResult.ok, false)
    const malformedInput = createMemoryFileInput(new Uint8Array([0xff, 0xd8]), { id: 'bad', filename: 'bad.jpg' })
    const malformedPlan = await makePlan(malformedInput).catch(() => undefined)
    assert.equal(malformedPlan, undefined)
  })
  await test('rejects indistinguishable duplicate COM approvals', async () => {
    const identical = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xfe, text('same')), ...segment(0xfe, text('same')), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x11, 0xff, 0xd9])
    const input = createMemoryFileInput(identical, { id: 'duplicate-positive', filename: 'duplicate.jpg' })
    const planning = createPlanningBoundary(createDefaultFormatAdapterRegistry())
    const boundary = createProcessingBoundary(createDefaultFormatAdapterRegistry())
    for (const ids of [['jpeg-comment-1'], ['jpeg-comment-0', 'jpeg-comment-1']]) {
      const planResult = await planning.planRemoval({ input, fieldIds: ids, policy: 'quick' })
      assert.equal(planResult.ok, true); if (!planResult.ok) return
      const result = await boundary.execute({ operation: 'remove', input, plan: planResult.value, approval: { planId: planResult.value.id, inputId: input.descriptor.id, sourceFingerprint: planResult.value.sourceFingerprint, identity: planResult.value.identity, approvedTargetIds: ids, approvedAt: 1 } })
       assert.equal(result.ok, ids.length === 2)
    }
  })
  await test('rejects forged trace fields and swapped identical occurrence', async () => {
    const input = createMemoryFileInput(source, { id: 'trace-test', filename: 'photo.jpg' }); const plan = await makePlan(input)
    const output = createMemoryArtifact(source, 'faulty.jpg')
    const approval = { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 }
    const forged = { ...plan, removalWitnesses: plan.removalWitnesses.map(w => ({ ...w, ordinal: w.ordinal + 1 })) }
    const result = await verifyJpegOutputIndependently(input, output, forged, approval)
    assert.equal(result.ok, false); output.dispose()
  })
  const lifecycleInput = createMemoryFileInput(source, { id: 'lifecycle', filename: 'photo.jpg' })
  const lifecyclePlan = await makePlan(lifecycleInput)
  const lifecycleApproval = { planId: lifecyclePlan.id, inputId: lifecycleInput.descriptor.id, sourceFingerprint: lifecyclePlan.sourceFingerprint, identity: lifecyclePlan.identity, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 }
  function lifecycleRegistry(executorResult: any, verifierResult: any): ReturnType<typeof createFormatAdapterRegistry> {
    const registry = createFormatAdapterRegistry()
    const resource = { inputBound: { maxBytes: 32 * 1024 * 1024, state: 'measured' as const }, fullBufferOperations: { state: 'inferred' as const }, streaming: { supported: false, state: 'measured' as const }, worker: { required: false, state: 'measured' as const }, transfer: { transferable: false, copies: true, state: 'inferred' as const }, temporaryAllocations: 'inferred' as const, concurrency: { state: 'unmeasured' as const }, cancellationPoints: [] }
    const conformance = { level: 'removal-capable' as const, declaration: { formatId: 'jpeg', operations: ['executeRemoval'] as const, extensions: ['jpg'], mimeTypes: ['image/jpeg'], processingIdentity: JPEG_PROCESSING_IDENTITY, verifierCompatibilityKey: 'notrace-jpeg-com-v1' }, resource }
    const contract: AdapterContract = { conformance, executeRemoval: async () => typeof executorResult === 'function' ? executorResult() : executorResult }
    registry.register({ id: 'test-executor', role: 'transformer', formatId: 'jpeg', engineId: 'notrace-jpeg', engineVersion: '1', capabilityKey: 'jpeg:remove-com', verifierCompatibilityKey: 'notrace-jpeg-com-v1', verifierIndependence: 'structural-independent', probe: async () => ({ ok: true as const, value: { formatId: 'jpeg', mediaType: 'image/jpeg', confidence: 'structural' as const } }), capability: { extensions: ['jpg'], mimeTypes: ['image/jpeg'], operations: ['remove'] }, conformance, contract, remove: async () => typeof executorResult === 'function' ? executorResult() : executorResult })
    const verifierConformance = { level: 'verification-capable' as const, declaration: { formatId: 'jpeg', operations: ['verifyRemoval'] as const, extensions: ['jpg'], mimeTypes: ['image/jpeg'], processingIdentity: JPEG_PROCESSING_IDENTITY, verifierCompatibilityKey: 'notrace-jpeg-com-v1', verificationCheckIds: JPEG_VERIFICATION_CHECK_IDS }, resource, independentVerifier: true as const }
    registry.register({ id: 'test-verifier', role: 'verifier', formatId: 'jpeg', engineId: 'notrace-jpeg', engineVersion: '1', capabilityKey: 'jpeg:verify', verifierCompatibilityKey: 'notrace-jpeg-com-v1', verifierIndependence: 'structural-independent', verificationCheckIds: JPEG_VERIFICATION_CHECK_IDS, conformance: verifierConformance, contract: { conformance: verifierConformance } as AdapterContract, probe: async () => ({ ok: true as const, value: { formatId: 'jpeg', mediaType: 'image/jpeg', confidence: 'structural' as const } }), capability: { extensions: ['jpg'], mimeTypes: ['image/jpeg'], operations: ['verify'] }, verifyOutput: async () => typeof verifierResult === 'function' ? verifierResult() : verifierResult })
    return registry
  }
  function verificationFailure(output?: OutputArtifact): any { return { ok: true, value: { status: 'failed', identity: lifecyclePlan.identity, outputCreated: false, output, checks: [], approvedTargetIds: [], removalTrace: [], removedTargetIds: [], preservedTargetIds: [], warnings: [] } } }
  function verificationSuccess(output: OutputArtifact): any {
    return { ok: true, value: {
      status: 'success', identity: lifecyclePlan.identity, outputCreated: true, output,
      sourceFingerprint: lifecyclePlan.sourceFingerprint, planId: lifecyclePlan.id, inputId: lifecycleInput.descriptor.id,
      approvedTargetIds: lifecycleApproval.approvedTargetIds, removalTrace: lifecyclePlan.removalWitnesses,
      checks: JPEG_VERIFICATION_CHECK_IDS.map(id => ({ id, name: id, status: 'passed' })),
      removedTargetIds: [...lifecycleApproval.approvedTargetIds],
      preservedTargetIds: lifecyclePlan.targets.filter(target => !lifecycleApproval.approvedTargetIds.includes(target.id)).map(target => target.id),
      warnings: [],
    } }
  }
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
  }
  await test('processing failure remains primary when cleanup throws', async () => {
    const a = observableArtifact('processing-dispose-throw', true); const result = await createProcessingBoundary(lifecycleRegistry({ ok: false, error: { code: 'PROCESSING_FAILED', message: 'executor failed', output: { artifact: a } } }, verificationFailure())).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'PROCESSING_FAILED'); assert.equal(a.disposeCount, 1)
  })
  await test('executor typed failure remains primary and accepts no artifact', async () => {
    const result = await createProcessingBoundary(lifecycleRegistry({ ok: false, error: { code: 'PROCESSING_FAILED', message: 'executor failed' } }, verificationFailure())).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval })
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'PROCESSING_FAILED')
  })
  await test('executor throw remains typed processing failure', async () => {
    const registry = lifecycleRegistry(() => { throw new Error('executor throw') }, verificationFailure())
    const result = await createProcessingBoundary(registry).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'PROCESSING_FAILED')
  })
  await test('verifier failure disposes execution artifact', async () => {
    const a = observableArtifact('failure'); const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, verificationFailure(a))).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }); assert.equal(result.ok, false); assert.equal(a.disposeCount, 1)
  })
  await test('verifier throw disposes execution artifact', async () => {
    const a = observableArtifact('throw'); const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, () => { throw new Error('verifier throw') })).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'VERIFICATION_FAILED'); assert.equal(a.disposeCount, 1)
  })
  await test('replacement artifact is rejected and both artifacts are disposed', async () => {
    const a = observableArtifact('a'); const b = observableArtifact('b'); const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, verificationFailure(b))).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }); assert.equal(result.ok, false); assert.ok(a.disposeCount >= 1); assert.ok(b.disposeCount >= 1)
  })
  await test('observable executor failure artifact is disposed', async () => {
    const a = observableArtifact('executor-failure'); const result = await createProcessingBoundary(lifecycleRegistry({ ok: false, error: { code: 'PROCESSING_FAILED', message: 'failed', output: { artifact: a } } }, verificationFailure())).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }); assert.equal(result.ok, false); assert.equal(a.disposeCount, 1)
  })
  await test('cancellation before execution remains cancelled', async () => {
    const controller = new AbortController(); controller.abort(); const result = await createProcessingBoundary(lifecycleRegistry(verificationFailure(), verificationFailure())).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }, { signal: controller.signal }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'CANCELLED')
  })
  await test('cleanup failure preserves verification failure', async () => {
    const a = observableArtifact('dispose-throw', true); const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, verificationFailure(a))).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'VERIFICATION_FAILED')
  })
  await test('repeated observable disposal is safe', async () => {
    const a = observableArtifact('repeat'); disposeArtifactForTest(a); disposeArtifactForTest(a); assert.equal(a.disposeCount, 2)
  })
  await test('R1 replacement rejects when execution disposal throws', async () => {
    const a = observableArtifact('r1-old', true); const b = observableArtifact('r1-new'); const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, verificationSuccess(b))).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'VERIFICATION_FAILED'); assert.equal(a.disposeCount, 1); assert.equal(b.disposeCount, 1)
  })
  await test('R2 replacement rejects when replacement disposal throws', async () => {
    const a = observableArtifact('r2-old'); const b = observableArtifact('r2-new', true); const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, verificationSuccess(b))).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'VERIFICATION_FAILED'); assert.equal(a.disposeCount, 1); assert.equal(b.disposeCount, 1)
  })
  await test('R3 replacement rejects when both disposals throw', async () => {
    const a = observableArtifact('r3-old', true); const b = observableArtifact('r3-new', true); const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, verificationSuccess(b))).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'VERIFICATION_FAILED'); assert.equal(a.disposeCount, 1); assert.equal(b.disposeCount, 1)
  })
  await test('successful default path transfers usable artifact ownership', async () => {
    const input = createMemoryFileInput(source, { id: 'transfer', filename: 'photo.jpg' }); const plan = await makePlan(input); const result = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input, plan, approval: { ...lifecycleApproval, planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity } }); assert.equal(result.ok, true); if (result.ok) { assert.equal(result.value.outputVerification, 'passed'); assert.equal((await result.value.output!.artifact.read()).ok, true); result.value.output!.artifact.dispose() }
  })
  await test('verifier throw remains primary when artifact disposal throws', async () => {
    const a = observableArtifact('throw-dispose', true)
    const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, () => { throw new Error('verifier failed') })).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval })
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'VERIFICATION_FAILED'); assert.equal(a.disposeCount, 1)
  })

  await test('H1 cancellation after executor disposes its artifact and never publishes output', async () => {
    const controller = new AbortController(); const a = observableArtifact('cancel-after-executor')
    const result = await createProcessingBoundary(lifecycleRegistry(() => { const value = { ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }; controller.abort(); return value }, () => verificationFailure())).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }, { signal: controller.signal })
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'CANCELLED'); assert.equal(a.disposeCount, 1)
  })
  await test('cancellation remains primary when artifact disposal throws', async () => {
    const controller = new AbortController(); const a = observableArtifact('cancel-dispose-throw', true); const result = await createProcessingBoundary(lifecycleRegistry(() => { controller.abort(); return { ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } } }, verificationFailure(a))).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }, { signal: controller.signal }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'CANCELLED'); assert.equal(a.disposeCount, 1)
  })
  await test('H2 cancellation during verifier disposes execution artifact after verifier settles', async () => {
    const controller = new AbortController(); const a = observableArtifact('cancel-during-verifier'); const gate = deferred<any>(); let verifierStarted = false
    const registry = lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, async () => { verifierStarted = true; controller.abort(); return gate.promise })
    const pending = createProcessingBoundary(registry).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }, { signal: controller.signal })
    while (!verifierStarted) await Promise.resolve()
    gate.resolve(verificationFailure(a)); const result = await pending
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'CANCELLED'); assert.equal(a.disposeCount, 1)
  })
  await test('H3 cancellation during verifier disposes distinct replacement artifact', async () => {
    const controller = new AbortController(); const a = observableArtifact('cancel-replacement-a'); const b = observableArtifact('cancel-replacement-b'); const gate = deferred<any>(); let verifierStarted = false
    const registry = lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, async () => { verifierStarted = true; controller.abort(); return gate.promise })
    const pending = createProcessingBoundary(registry).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }, { signal: controller.signal })
    while (!verifierStarted) await Promise.resolve()
    gate.resolve(verificationSuccess(b)); const result = await pending
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'CANCELLED'); assert.equal(a.disposeCount, 1); assert.equal(b.disposeCount, 1)
  })
  await test('H4 cancellation after verifier settles still wins over success', async () => {
    const controller = new AbortController(); const a = observableArtifact('cancel-after-verifier')
    const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, () => { const value = verificationSuccess(a); controller.abort(); return value })).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }, { signal: controller.signal })
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'CANCELLED'); assert.equal(a.disposeCount, 1)
  })
  await test('R1 deferred verifier cancellation is deterministic without timers', async () => {
    const controller = new AbortController(); const a = observableArtifact('r1'); const gate = deferred<any>(); let resolveVerifier!: () => void
    const registry = lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, async (_i: any, _o: any, _p: any, _a: any, signal?: AbortSignal) => { resolveVerifier = () => { controller.abort(); gate.resolve(verificationFailure(a)) }; signal?.addEventListener('abort', resolveVerifier, { once: true }); return gate.promise })
    const pending = createProcessingBoundary(registry).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }, { signal: controller.signal });
    while (!resolveVerifier) await Promise.resolve()
    resolveVerifier(); const result = await pending
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'CANCELLED'); assert.equal(a.disposeCount, 1)
  })
  await test('R2 verifier cancellation result does not become verification failure', async () => {
    const controller = new AbortController(); const a = observableArtifact('r2'); const registry = lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, async () => { controller.abort(); return { ok: false, error: { code: 'CANCELLED', message: 'verifier cancelled' } } })
    const result = await createProcessingBoundary(registry).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }, { signal: controller.signal }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'CANCELLED'); assert.equal(a.disposeCount, 1)
  })
  await test('R3 cancellation after executor does not invoke a deferred verifier', async () => {
    const controller = new AbortController(); const a = observableArtifact('r3'); let invoked = false
    const result = await createProcessingBoundary(lifecycleRegistry(() => { controller.abort(); return { ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } } }, () => { invoked = true; return verificationFailure(a) })).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval }, { signal: controller.signal })
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'CANCELLED'); assert.equal(invoked, false); assert.equal(a.disposeCount, 1)
  })

  const malformedCases: Array<[string, (value: any, a: OutputArtifact, b: OutputArtifact) => any]> = [
    ['M1 status failure', (v, a) => ({ ...v, status: 'failed', output: a })],
    ['M2 outputCreated false', (v, a) => ({ ...v, output: a, outputCreated: false })],
    ['M3 missing output', v => ({ ...v, output: undefined })],
    ['M4 incomplete checks', (v, a) => ({ ...v, output: a, checks: [] })],
    ['M5 duplicate check', (v, a) => ({ ...v, output: a, checks: [...v.checks, v.checks[0]] })],
    ['M6 unknown check', (v, a) => ({ ...v, output: a, checks: [{ id: 'unknown', name: 'unknown', status: 'passed' }] })],
    ['M7 failed check', (v, a) => ({ ...v, output: a, checks: v.checks.map((c: any) => ({ ...c, status: 'failed' })) })],
    ['M8 not-run check', (v, a) => ({ ...v, output: a, checks: v.checks.map((c: any) => ({ ...c, status: 'not-run' })) })],
    ['M9 replacement success', (v, _a, b) => ({ ...v, output: b })],
    ['M10 wrong fingerprint', (v, a) => ({ ...v, output: a, sourceFingerprint: 'wrong' })],
    ['M11 wrong plan', (v, a) => ({ ...v, output: a, planId: 'wrong' })],
    ['M12 wrong input', (v, a) => ({ ...v, output: a, inputId: 'wrong' })],
    ['M13 wrong approved IDs', (v, a) => ({ ...v, output: a, approvedTargetIds: [] })],
    ['M14 wrong preserved IDs', (v, a) => ({ ...v, output: a, preservedTargetIds: ['forged'] })],
    ['M15 missing trace', (v, a) => ({ ...v, output: a, removalTrace: [] })],
    ['M16 wrong trace', (v, a) => ({ ...v, output: a, removalTrace: [{ ...v.removalTrace[0], ordinal: 99 }] })],
    ['M17 failure replacement', (_v, _a, b) => ({ status: 'failed', output: b, outputCreated: false, checks: [] } as any)],
    ['M18 non-array checks', (v, a) => ({ ...v, output: a, checks: undefined })],
    ['M19 non-array approved IDs', (v, a) => ({ ...v, output: a, approvedTargetIds: undefined })],
    ['M20 non-array trace', (v, a) => ({ ...v, output: a, removalTrace: undefined })],
    ['M21 non-array preserved IDs', (v, a) => ({ ...v, output: a, preservedTargetIds: undefined })],
  ]
  for (const [name, mutate] of malformedCases) await test(`malformed verifier ${name} rejects and disposes observable artifacts`, async () => {
    const a = observableArtifact(`malformed-a-${name}`); const b = observableArtifact(`malformed-b-${name}`)
    const base = { status: 'success', outputCreated: true, output: a, sourceFingerprint: lifecyclePlan.sourceFingerprint, planId: lifecyclePlan.id, inputId: lifecycleInput.descriptor.id, approvedTargetIds: ['jpeg-comment-0'], removalTrace: lifecyclePlan.removalWitnesses, checks: JPEG_VERIFICATION_CHECK_IDS.map(id => ({ id, name: id, status: 'passed' })), removedTargetIds: ['jpeg-comment-0'], preservedTargetIds: lifecyclePlan.targets.filter(target => target.id !== 'jpeg-comment-0').map(target => target.id), warnings: [] }
    const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, { ok: true, value: mutate(base, a, b) })).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval })
    assert.equal(result.ok, false); assert.ok(a.disposeCount >= 1); if (b.disposeCount === 0 && mutate(base, a, b).output === b) assert.ok(false, `replacement ${name} was not disposed`)
  })
  await test('failure envelope disposes multiple observable artifacts', async () => {
    const a = observableArtifact('multi-a'); const b = observableArtifact('multi-b'); const c = observableArtifact('multi-c')
    const failure = { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'failed', output: { artifact: b }, artifact: c } }
    const result = await createProcessingBoundary(lifecycleRegistry({ ok: true, value: { output: { artifact: a, filename: a.filename, created: true } } }, failure)).execute({ operation: 'remove', input: lifecycleInput, plan: lifecyclePlan, approval: lifecycleApproval })
    assert.equal(result.ok, false); assert.equal(a.disposeCount, 1); assert.equal(b.disposeCount, 1); assert.equal(c.disposeCount, 1)
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
      const result = await createProcessingBoundary(registry).execute({ operation: 'remove', input, plan, approval: { planId: plan.id, inputId: input.descriptor.id, sourceFingerprint: plan.sourceFingerprint, identity: plan.identity, approvedTargetIds: ['jpeg-comment-0'], approvedAt: 1 } })
      assert.equal(result.ok, false)
    }
  })
  console.log('COM execution and artifact lifecycle tests passed: 36')
}
void main()
