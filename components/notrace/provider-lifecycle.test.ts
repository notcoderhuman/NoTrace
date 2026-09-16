import { strict as assert } from 'node:assert'
import { createArtifactOwnershipController, createRemovalLifecycleController, disposeOwnedArtifact, disposeOwnedArtifacts, exactIdSet, exactWitnessSet, settleRemovalCompletion } from './provider'
import type { OutputArtifact } from '@/lib/processing-core/domain/artifact'
import { JPEG_PROCESSING_IDENTITY } from '@/lib/processing-core/domain/identity'

function artifact(id: string, throws = false): OutputArtifact & { disposeCount: number } {
  let disposeCount = 0
  return {
    id, filename: `${id}.jpg`, mediaType: 'image/jpeg', size: 1,
    get disposeCount() { return disposeCount },
    async read() { return { ok: true, value: new Uint8Array([1]) } },
    dispose() { disposeCount += 1; if (throws) throw new Error('dispose failed') },
  }
}

async function test(name: string, fn: () => void | Promise<void>) { await fn(); console.log(`PASS ${name}`) }

async function main() {
  await test('exact removal witnesses reject forged and duplicate traces', () => {
    const witness = { sourceFingerprint: 'source', targetId: 'target', ordinal: 0, startOffset: 10, endOffset: 20, marker: 254, rangeLength: 10 }
    assert.equal(exactWitnessSet([witness], [witness]), true)
    assert.equal(exactWitnessSet([{ ...witness, targetId: 'other' }], [witness]), false)
    assert.equal(exactWitnessSet([{ ...witness, ordinal: 1 }], [witness]), false)
    assert.equal(exactWitnessSet([{ ...witness, startOffset: 11 }], [witness]), false)
    assert.equal(exactWitnessSet([{ ...witness, endOffset: 21 }], [witness]), false)
    assert.equal(exactWitnessSet([{ ...witness, marker: 255 }], [witness]), false)
    assert.equal(exactWitnessSet([{ ...witness, rangeLength: 9 }], [witness]), false)
    assert.equal(exactWitnessSet([{ ...witness, sourceFingerprint: 'other' }], [witness]), false)
    assert.equal(exactWitnessSet([], [witness]), false)
    assert.equal(exactWitnessSet([witness, witness], [witness]), false)
  })
  await test('exact check and preserved target inventories reject duplicates and omissions', () => {
    assert.equal(exactIdSet(['A', 'B', 'C'], ['A', 'B', 'C']), true)
    assert.equal(exactIdSet(['A', 'A', 'C'], ['A', 'B', 'C']), false)
    assert.equal(exactIdSet(['A', 'C'], ['A', 'B', 'C']), false)
    assert.equal(exactIdSet(['A', 'B', 'C', 'X'], ['A', 'B', 'C']), false)
    assert.equal(exactIdSet(['A', 'X', 'C'], ['A', 'B', 'C']), false)
    assert.equal(exactIdSet(['P1', 'P2'], ['P1', 'P2']), true)
    assert.equal(exactIdSet(['P1'], ['P1', 'P2']), false)
    assert.equal(exactIdSet(['P1', 'P3'], ['P1', 'P2']), false)
    assert.equal(exactIdSet(['P1', 'P1'], ['P1', 'P2']), false)
    assert.equal(exactIdSet([], []), true)
    assert.equal(exactIdSet(['P1'], []), false)
  })
  await test('actual provider removeFile disposes verified artifact and clears ownership', () => {
    const owned = new Map<string, OutputArtifact>(); const a = artifact('file-a'); owned.set('file-a', a)
    disposeOwnedArtifact(owned, 'file-a'); assert.equal(a.disposeCount, 1); assert.equal(owned.has('file-a'), false)
  })
  await test('clearSession disposes every provider-owned artifact', () => {
    const owned = new Map<string, OutputArtifact>(); const a = artifact('a'); const b = artifact('b'); owned.set('a', a); owned.set('b', b)
    disposeOwnedArtifacts(owned); assert.equal(a.disposeCount, 1); assert.equal(b.disposeCount, 1); assert.equal(owned.size, 0)
  })
  await test('provider unmount cleanup does not escape dispose errors', () => {
    const owned = new Map<string, OutputArtifact>(); const a = artifact('throwing', true); owned.set('a', a)
    disposeOwnedArtifacts(owned); assert.equal(a.disposeCount, 1); assert.equal(owned.size, 0)
  })
  await test('stale success disposes returned artifact and never retains it', () => {
    const owned = new Map<string, OutputArtifact>(); const a = artifact('stale'); a.dispose(); assert.equal(a.disposeCount, 1); assert.equal(owned.size, 0)
  })
  await test('rejected artifacts never reach provider state', () => {
    const owned = new Map<string, OutputArtifact>(); const a = artifact('rejected'); a.dispose(); assert.equal(owned.has(a.id), false); assert.equal(a.disposeCount, 1)
  })
  await test('lifecycle accepts only the current matching operation', () => {
    const lifecycle = createRemovalLifecycleController(); const first = lifecycle.begin('file', 'input'); assert.equal(lifecycle.isCurrent(first, 'file', 'input'), true); assert.equal(lifecycle.isCurrent(first, 'other', 'input'), false); assert.equal(lifecycle.isCurrent(first, 'file', 'other'), false); const second = lifecycle.begin('file', 'input-2'); assert.equal(first.signal.aborted, true); assert.equal(lifecycle.isCurrent(first, 'file', 'input'), false); assert.equal(lifecycle.isCurrent(second, 'file', 'input-2'), true)
  })
  await test('ownership rejects aliasing the same artifact under two file IDs', () => {
    const ownership = createArtifactOwnershipController(); const a = artifact('alias'); assert.equal(ownership.adopt('a', a, 'EXECUTION_OWNED', JPEG_PROCESSING_IDENTITY).ok, true); assert.equal(ownership.adopt('b', a, 'EXECUTION_OWNED', JPEG_PROCESSING_IDENTITY).ok, false); ownership.clear(); assert.equal(a.disposeCount, 1)
  })
  await test('initial ownership aliases retain one entry and dispose exactly once', () => {
    const aliased = artifact('initial-alias'); const unrelated = artifact('initial-unrelated'); const initial = new Map<string, OutputArtifact>([['first', aliased], ['alias', aliased], ['other', unrelated]])
    const ownership = createArtifactOwnershipController(initial)
    assert.equal(ownership.size(), 2); assert.equal(ownership.get('first'), aliased); assert.equal(ownership.get('alias'), undefined); assert.equal(ownership.get('other'), unrelated); assert.equal(aliased.disposeCount, 0); assert.equal(unrelated.disposeCount, 0)
    ownership.clear(); assert.equal(aliased.disposeCount, 1); assert.equal(unrelated.disposeCount, 1); assert.equal(ownership.size(), 0); ownership.clear(); assert.equal(aliased.disposeCount, 1); assert.equal(unrelated.disposeCount, 1)
  })
  await test('ownership replacement disposes old artifact before retaining new artifact', () => {
    const ownership = createArtifactOwnershipController(); const a = artifact('old'); const b = artifact('new'); ownership.adopt('file', a, 'EXECUTION_OWNED', JPEG_PROCESSING_IDENTITY); ownership.adopt('file', b, 'EXECUTION_OWNED', JPEG_PROCESSING_IDENTITY); assert.equal(a.disposeCount, 1); assert.equal(ownership.get('file'), b); ownership.remove('file'); assert.equal(b.disposeCount, 1)
  })
  await test('actual production completion rejects stale successful promise', async () => {
    const lifecycle = createRemovalLifecycleController(); const ownership = createArtifactOwnershipController(); const operation = lifecycle.begin('file', 'input'); let release!: (value: any) => void; const pending = new Promise<any>(resolve => { release = resolve }); lifecycle.invalidate(); const a = artifact('stale-provider'); release({ ok: true, value: { outputVerification: 'passed', output: { created: true, artifact: a } } }); const result = await pending; const expectedPlan: any = { id: 'plan', input: { id: 'input' }, sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, preservedTargetIds: [], removalWitnesses: [] }; const expectedApproval: any = { planId: 'plan', inputId: 'input', sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, approvedTargetIds: [], approvedAt: 1 }; const completion = settleRemovalCompletion({ lifecycle, ownership, operation, fileId: 'file', inputId: 'input', requestId: operation.generation, selectedId: 'file', currentInput: undefined, expectedInput: undefined, expectedPlan, expectedApproval, result }); assert.equal(completion.kind, 'stale'); assert.equal(a.disposeCount, 1); assert.equal(ownership.size(), 0)
  })
  await test('actual production completion adopts exact verified ownership', () => {
    const lifecycle = createRemovalLifecycleController(); const ownership = createArtifactOwnershipController(); const operation = lifecycle.begin('file', 'input'); const a = artifact('owned'); const result: any = { ok: true, value: { status: 'success', outputVerification: 'passed', verification: { status: 'success', outputCreated: true, output: a, inputId: 'input', planId: 'plan', sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, approvedTargetIds: [], removedTargetIds: [], preservedTargetIds: [], removalTrace: [], checks: ['output-soi','output-eoi','segment-structure','output-size','segment-count','approved-com-absent','preserved-targets-present','image-bytes-preserved','retained-segments-preserved','retained-order-preserved','no-unexpected-changes','original-unchanged','distinct-artifact'].map(id => ({ id, status: 'passed' })) }, identity: JPEG_PROCESSING_IDENTITY, output: { created: true, artifact: a } } }; const expectedPlan: any = { id: 'plan', input: { id: 'input' }, sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, preservedTargetIds: [], removalWitnesses: [] }; const expectedApproval: any = { planId: 'plan', inputId: 'input', sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, approvedTargetIds: [], approvedAt: 1 }; const completion = settleRemovalCompletion({ lifecycle, ownership, operation, fileId: 'file', inputId: 'input', requestId: operation.generation, selectedId: 'file', currentInput: 'same', expectedInput: 'same', expectedPlan, expectedApproval, result }); assert.equal(completion.kind, 'success'); assert.equal(ownership.get('file'), a); assert.equal(a.disposeCount, 0); ownership.remove('file'); assert.equal(a.disposeCount, 1)
  })
  await test('completion rejects missing authoritative verification', () => {
    const lifecycle = createRemovalLifecycleController(); const ownership = createArtifactOwnershipController(); const operation = lifecycle.begin('file', 'input'); const a = artifact('missing-verification'); const result: any = { ok: true, value: { status: 'success', outputVerification: 'passed', identity: JPEG_PROCESSING_IDENTITY, output: { created: true, artifact: a } } }; const expectedPlan: any = { id: 'plan', input: { id: 'input' }, sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, preservedTargetIds: [], removalWitnesses: [] }; const expectedApproval: any = { planId: 'plan', inputId: 'input', sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, approvedTargetIds: [], approvedAt: 1 }; const completion = settleRemovalCompletion({ lifecycle, ownership, operation, fileId: 'file', inputId: 'input', requestId: operation.generation, selectedId: 'file', currentInput: 'same', expectedInput: 'same', expectedPlan, expectedApproval, result }); assert.equal(completion.kind, 'failed'); assert.equal(ownership.size(), 0); assert.equal(a.disposeCount, 1)
  })
  await test('actual production completion rejects current failed result without ownership', () => {
    const lifecycle = createRemovalLifecycleController(); const ownership = createArtifactOwnershipController(); const operation = lifecycle.begin('file', 'input'); const a = artifact('failed'); const result: any = { ok: true, value: { outputVerification: 'failed', output: { created: true, artifact: a } } }; const expectedPlan: any = { id: 'plan', input: { id: 'input' }, sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, preservedTargetIds: [], removalWitnesses: [] }; const expectedApproval: any = { planId: 'plan', inputId: 'input', sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, approvedTargetIds: [], approvedAt: 1 }; const completion = settleRemovalCompletion({ lifecycle, ownership, operation, fileId: 'file', inputId: 'input', requestId: operation.generation, selectedId: 'file', currentInput: 'same', expectedInput: 'same', expectedPlan, expectedApproval, result }); assert.equal(completion.kind, 'failed'); assert.equal(a.disposeCount, 1); assert.equal(ownership.size(), 0)
  })
  await test('post-transfer invalidation preserves provider ownership until cleanup', async () => {
    const lifecycle = createRemovalLifecycleController(); const ownership = createArtifactOwnershipController(); const operation = lifecycle.begin('file', 'input'); const a = artifact('post-transfer'); const result: any = { ok: true, value: { status: 'success', outputVerification: 'passed', verification: { status: 'success', outputCreated: true, output: a, inputId: 'input', planId: 'plan', sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, approvedTargetIds: [], removedTargetIds: [], preservedTargetIds: [], removalTrace: [], checks: ['output-soi','output-eoi','segment-structure','output-size','segment-count','approved-com-absent','preserved-targets-present','image-bytes-preserved','retained-segments-preserved','retained-order-preserved','no-unexpected-changes','original-unchanged','distinct-artifact'].map(id => ({ id, status: 'passed' })) }, identity: JPEG_PROCESSING_IDENTITY, output: { created: true, artifact: a } } }; const expectedPlan: any = { id: 'plan', input: { id: 'input' }, sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, preservedTargetIds: [], removalWitnesses: [] }; const expectedApproval: any = { planId: 'plan', inputId: 'input', sourceFingerprint: 'source', identity: JPEG_PROCESSING_IDENTITY, approvedTargetIds: [], approvedAt: 1 }; assert.equal(settleRemovalCompletion({ lifecycle, ownership, operation, fileId: 'file', inputId: 'input', requestId: operation.generation, selectedId: 'file', currentInput: 'same', expectedInput: 'same', expectedPlan, expectedApproval, result }).kind, 'success'); lifecycle.invalidate(); assert.equal(ownership.get('file'), a); assert.equal((await a.read()).ok, true); assert.equal(a.disposeCount, 0); ownership.remove('file'); assert.equal(a.disposeCount, 1)
  })
  await test('production lifecycle cleanup rejects active async completion', async () => {
    const lifecycle = createRemovalLifecycleController(); const operation = lifecycle.begin('file', 'input'); let release!: () => void; const held = new Promise<void>(resolve => { release = resolve }); const pending = held.then(() => artifact('stale'))
    lifecycle.invalidate(); release(); const stale = await pending; assert.equal(lifecycle.isCurrent(operation, 'file', 'input'), false); stale.dispose(); assert.equal(stale.disposeCount, 1); assert.equal(lifecycle.currentGeneration() > operation.generation, true)
  })
  await test('production ownership controller removes artifacts and invalidates download ownership', () => {
    const owned = new Map<string, OutputArtifact>(); const controller = createArtifactOwnershipController(owned); const a = artifact('downloadable'); controller.adopt('file', a, 'EXECUTION_OWNED', JPEG_PROCESSING_IDENTITY); assert.equal(controller.has('file'), true); assert.equal(controller.get('file'), a); controller.remove('file'); assert.equal(controller.has('file'), false); assert.equal(controller.get('file'), undefined); assert.equal(controller.size(), 0); assert.equal(a.disposeCount, 1)
  })
  await test('provider download becomes unavailable after ownership removal', async () => {
    const owned = new Map<string, OutputArtifact>(); const controller = createArtifactOwnershipController(owned); const a = artifact('download'); controller.adopt('file', a, 'EXECUTION_OWNED', JPEG_PROCESSING_IDENTITY)
    assert.equal((await controller.get('file')!.read()).ok, true); controller.remove('file'); assert.equal(controller.get('file'), undefined); assert.equal(owned.has('file'), false)
  })
  await test('active async unmount seam clears ownership before stale completion', async () => {
    const owned = new Map<string, OutputArtifact>(); const controller = createArtifactOwnershipController(owned); const a = artifact('async-unmount'); controller.adopt('file', a, 'EXECUTION_OWNED', JPEG_PROCESSING_IDENTITY)
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve }); const pending = held.then(() => a)
    controller.clear(); release(); const stale = await pending; assert.equal(stale.disposeCount, 1); assert.equal(controller.size(), 0)
  })
  await test('successful transfer preserves provider artifact until provider cleanup', () => {
    const owned = new Map<string, OutputArtifact>(); const a = artifact('transferred'); owned.set('file', a)
    assert.equal(a.disposeCount, 0); assert.equal(owned.get('file'), a); disposeOwnedArtifacts(owned); assert.equal(a.disposeCount, 1)
  })
  console.log('Provider artifact lifecycle tests passed: 6')
}
void main()
