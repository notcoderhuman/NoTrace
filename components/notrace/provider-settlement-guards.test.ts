import { strict as assert } from 'node:assert'
import { createArtifactOwnershipController, createRemovalLifecycleController, settleRemovalCompletion } from './provider'
import type { OutputArtifact } from '@/lib/processing-core/domain/artifact'
import { JPEG_PROCESSING_IDENTITY } from '@/lib/processing-core/domain/identity'

/**
 * B2 / B3 regression — settlement has EXACTLY ONE success path, and the expected verification check
 * set is the canonical NoTrace-owned set stamped by the boundary, never the result's own checks.
 */

const IDENTITY = JPEG_PROCESSING_IDENTITY
const WITNESS = { sourceFingerprint: 'source', targetId: 't', ordinal: 0, startOffset: 0, endOffset: 4, marker: 254, rangeLength: 4 }
const PLAN: any = { id: 'plan', input: { id: 'input' }, sourceFingerprint: 'source', identity: IDENTITY, targets: [{ id: 't' }], removableTargetIds: ['t'], preservedTargetIds: [], removalWitnesses: [WITNESS] }
const APPROVAL: any = { planId: 'plan', inputId: 'input', sourceFingerprint: 'source', identity: IDENTITY, approvedTargetIds: ['t'], approvedAt: 1 }
const DECLARED = ['check-a', 'check-b']

function artifact(id: string): OutputArtifact & { disposeCount: number } {
  let disposeCount = 0
  return {
    id, filename: `${id}.jpg`, mediaType: 'image/jpeg', size: 4,
    get disposeCount() { return disposeCount },
    async read() { return { ok: true, value: new Uint8Array([1, 2, 3, 4]) } },
    dispose() { disposeCount += 1 },
  }
}

function checks(ids: readonly string[], status: 'passed' | 'failed' | 'not-run' = 'passed') { return ids.map(id => ({ id, name: id, status })) }

function verifiedResult(target: OutputArtifact, over: { value?: any; verification?: any } = {}): any {
  const verification = {
    kind: 'verification', identity: IDENTITY, status: 'success', input: PLAN.input, outputCreated: true, output: target,
    sourceFingerprint: 'source', planId: 'plan', inputId: 'input', approvedTargetIds: ['t'], removalTrace: [WITNESS],
    checks: checks(DECLARED), removedTargetIds: ['t'], preservedTargetIds: [], warnings: [],
    ...over.verification,
  }
  return {
    ok: true,
    value: {
      kind: 'processing', status: 'success', input: { filename: 'photo.jpg' },
      output: { filename: 'out.jpg', created: true, artifact: target },
      outputVerification: 'passed', verificationCheckIds: DECLARED, verification, identity: IDENTITY,
      removedTargetIds: ['t'], preservedTargetIds: [], warnings: [],
      ...over.value,
    },
  }
}

function settle(result: any) {
  const lifecycle = createRemovalLifecycleController()
  const ownership = createArtifactOwnershipController()
  const operation = lifecycle.begin('file', 'input')
  const completion = settleRemovalCompletion({
    lifecycle, ownership, operation, fileId: 'file', inputId: 'input', requestId: operation.generation,
    selectedId: 'file', currentInput: 'same', expectedInput: 'same', expectedPlan: PLAN, expectedApproval: APPROVAL, result,
  })
  return { completion, ownership }
}

async function test(name: string, fn: () => void | Promise<void>) { await fn(); console.log(`PASS ${name}`) }

async function main() {
  // ---------------------------------------------------------------
  // Positive control
  // ---------------------------------------------------------------
  await test('B2/B3 genuine verified result still settles and adopts ownership', () => {
    const a = artifact('genuine')
    const { completion, ownership } = settle(verifiedResult(a))
    assert.equal(completion.kind, 'success')
    assert.equal(ownership.get('file'), a)
    assert.equal(a.disposeCount, 0)
  })

  // ---------------------------------------------------------------
  // B2 — exactly one success path
  // ---------------------------------------------------------------
  await test('B2 output.created=false cannot reach the success branch', () => {
    const a = artifact('not-created')
    const { completion, ownership } = settle(verifiedResult(a, { value: { output: { filename: 'out.jpg', created: false, artifact: a } } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B2 absent output.created cannot reach the success branch', () => {
    const a = artifact('missing-created')
    const { completion, ownership } = settle(verifiedResult(a, { value: { output: { filename: 'out.jpg', artifact: a } } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B2 missing output cannot reach the success branch', () => {
    const a = artifact('missing-output')
    const { completion, ownership } = settle(verifiedResult(a, { value: { output: undefined }, verification: { output: undefined } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
  })

  await test('B2 a strict-gate failure (forged witness) cannot be rescued into success', () => {
    const a = artifact('forged-witness')
    const forged = { ...WITNESS, ordinal: 99 }
    const { completion, ownership } = settle(verifiedResult(a, { verification: { removalTrace: [forged] } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B2 a strict-gate failure (wrong plan id) cannot be rescued into success', () => {
    const a = artifact('wrong-plan')
    const { completion, ownership } = settle(verifiedResult(a, { verification: { planId: 'other' } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B2 a strict-gate failure (identity mismatch) cannot be rescued into success', () => {
    const a = artifact('wrong-identity')
    const { completion, ownership } = settle(verifiedResult(a, { verification: { identity: { ...IDENTITY, capabilityKey: 'jpeg:forged' } } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B2 a failing check status cannot be rescued into success', () => {
    const a = artifact('failed-check')
    const { completion, ownership } = settle(verifiedResult(a, { verification: { checks: checks(DECLARED, 'failed') } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  // ---------------------------------------------------------------
  // B3 — expected check set is the canonical stamped set
  // ---------------------------------------------------------------
  await test('B3 absent canonical check set cannot settle', () => {
    const a = artifact('no-canonical-set')
    const { completion, ownership } = settle(verifiedResult(a, { value: { verificationCheckIds: undefined } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B3 empty canonical check set cannot settle', () => {
    const a = artifact('empty-canonical-set')
    const { completion, ownership } = settle(verifiedResult(a, { value: { verificationCheckIds: [] } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B3 actual checks that disagree with the canonical set cannot settle', () => {
    const a = artifact('made-up-checks')
    const { completion, ownership } = settle(verifiedResult(a, { verification: { checks: checks(['made-up']) } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B3 an extra actual check cannot settle', () => {
    const a = artifact('extra-check')
    const { completion, ownership } = settle(verifiedResult(a, { verification: { checks: checks([...DECLARED, 'extra']) } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B3 a missing actual check cannot settle', () => {
    const a = artifact('missing-check')
    const { completion, ownership } = settle(verifiedResult(a, { verification: { checks: checks([DECLARED[0]]) } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B3 duplicate actual check identities cannot settle', () => {
    const a = artifact('duplicate-check')
    const { completion, ownership } = settle(verifiedResult(a, { verification: { checks: checks([DECLARED[0], DECLARED[0]]) } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  await test('B3 the result cannot define its own expectations', () => {
    const a = artifact('self-defined')
    // The result claims a single check and simultaneously claims that this is the canonical set.
    // The provider must not treat a result-declared set as authoritative when it is inconsistent
    // with the checks actually reported.
    const { completion, ownership } = settle(verifiedResult(a, { value: { verificationCheckIds: ['only-this'] } }))
    assert.equal(completion.kind, 'failed')
    assert.equal(ownership.size(), 0)
    assert.equal(a.disposeCount, 1)
  })

  console.log('Provider settlement guard tests passed: 15')
}

void main()
