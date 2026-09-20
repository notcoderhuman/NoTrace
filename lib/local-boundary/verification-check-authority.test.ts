import { strict as assert } from 'node:assert'
import { createFormatAdapterRegistry, type FormatAdapter } from '../processing-core/adapters/registry'
import { createProcessingBoundary } from './processing-boundary'
import { createMemoryInput } from '../processing-core/domain/input'
import { createMemoryArtifact } from '../processing-core/domain/artifact'
import type { AdapterContract, EvidenceRecord, ResourceContract, StaticCapabilityDeclaration } from '../processing-core/domain/contracts'
import type { ProcessingIdentity } from '../processing-core/domain/identity'
import type { RemovalPlan } from '../processing-core/domain/operation'
import type { VerificationCheck } from '../processing-core/domain/result'

/**
 * B3 regression — the expected verification check set must come from the canonical contract
 * declaration, never from the VerificationResult being validated.
 */

const MEDIA = 'text/x-check-test'
const IDENTITY: ProcessingIdentity = { formatId: 'check-test', engineId: 'check-test-engine', engineVersion: '1', capabilityKey: 'check-test:remove-target', policyId: 'check-test-policy', policyVersion: '1', verifierCompatibilityKey: 'check-test-v1' }
const resource: ResourceContract = { inputBound: { maxBytes: 1024 * 1024, state: 'measured' }, fullBufferOperations: { state: 'inferred' }, streaming: { supported: false, state: 'measured' }, worker: { required: false, state: 'measured' }, transfer: { transferable: false, copies: true, state: 'inferred' }, temporaryAllocations: 'inferred', concurrency: { state: 'unmeasured' }, cancellationPoints: ['input read'] }
const evidence = (result: any): readonly EvidenceRecord[] => result.fields.map((field: any) => ({ id: field.id, label: field.label, category: field.category, state: 'detected', safety: 'safe-to-remove', targetId: field.id, explanation: field.value ?? 'probe', source: 'simulated-fixture', confidence: 'high' }))
const inspectOk = async () => ({ ok: true as const, value: { kind: 'inspection' as const, status: 'success' as const, input: { filename: 'a.chk' }, format: { state: 'supported' as const }, fields: [], warnings: [], analyzed: true as const } })

const TARGET = { id: 'check-target-0', kind: 'format-target' as const, marker: 0, ordinal: 0, startOffset: 0, endOffset: 4, formatId: 'check-test', typeId: 'check-target', category: 'comment' as const, scope: { formatId: 'check-test', scopeId: 'check-test' }, classification: 'SAFE_TO_REMOVE' as const, removable: true, reason: 'test' }
const WITNESS = { sourceFingerprint: 'fp', targetId: 'check-target-0', identity: { formatId: 'check-test', typeId: 'check-target', ordinal: 0, startOffset: 0, endOffset: 4 }, ordinal: 0, startOffset: 0, endOffset: 4, marker: 0, rangeLength: 4 }

function buildRegistry(declared: readonly string[], produceChecks: (declared: readonly string[]) => VerificationCheck[]) {
  const registry = createFormatAdapterRegistry()
  const transformerDeclaration: StaticCapabilityDeclaration = { formatId: 'check-test', operations: ['inspect', 'executeRemoval'], extensions: ['chk'], mimeTypes: [MEDIA], processingIdentity: IDENTITY, verifierCompatibilityKey: 'check-test-v1', verificationCheckIds: [...declared] }
  const transformerConformance = { level: 'removal-capable' as const, declaration: transformerDeclaration, resource }
  const executeRemoval = async (context: { descriptor: { filename: string } }, plan: RemovalPlan) => {
    const artifact = createMemoryArtifact(new Uint8Array([9, 9, 9]), 'out.chk', MEDIA)
    return { ok: true as const, value: { kind: 'processing' as const, status: 'success' as const, input: { filename: context.descriptor.filename }, output: { filename: artifact.filename, created: true as const, artifact }, outputVerification: 'not-run' as const, removalTrace: plan.removalWitnesses, removedTargetIds: ['check-target-0'], preservedTargetIds: [], warnings: [] } }
  }
  const transformer: FormatAdapter = {
    id: 'check-test-transformer', role: 'transformer', formatId: 'check-test', verifierCompatibilityKey: 'check-test-v1', verificationCheckIds: [...declared],
    probe: async () => ({ ok: true as const, value: { formatId: 'check-test', mediaType: MEDIA, confidence: 'structural' as const } }),
    capability: { extensions: ['chk'], mimeTypes: [MEDIA], operations: ['inspect', 'remove'] },
    evidence, inspect: inspectOk, conformance: transformerConformance,
    contract: { conformance: transformerConformance, evidence, inspect: inspectOk, executeRemoval } satisfies AdapterContract,
    remove: (input, plan) => executeRemoval({ descriptor: input.descriptor }, plan),
  }
  const verifierDeclaration: StaticCapabilityDeclaration = { formatId: 'check-test', operations: ['verifyRemoval'], extensions: ['chk'], mimeTypes: [MEDIA], processingIdentity: IDENTITY, verifierCompatibilityKey: 'check-test-v1', verificationCheckIds: [...declared] }
  const verifierConformance = { level: 'verification-capable' as const, declaration: verifierDeclaration, resource, independentVerifier: true as const }
  const verifier: FormatAdapter = {
    id: 'check-test-verifier', role: 'verifier', formatId: 'check-test', verifierCompatibilityKey: 'check-test-v1', verifierIndependence: 'structural-independent', verificationCheckIds: [...declared],
    probe: async () => ({ ok: true as const, value: { formatId: 'check-test', mediaType: MEDIA, confidence: 'structural' as const } }),
    capability: { extensions: ['chk'], mimeTypes: [MEDIA], operations: ['verify'] },
    conformance: verifierConformance, contract: { conformance: verifierConformance },
    verifyOutput: async (_input, output, plan, approval) => ({
      ok: true as const, value: {
        kind: 'verification' as const, identity: IDENTITY, status: 'success' as const, input: plan.input, outputCreated: true,
        output, sourceFingerprint: plan.sourceFingerprint, planId: plan.id, inputId: plan.input.id,
        approvedTargetIds: approval.approvedTargetIds, removalTrace: plan.removalWitnesses,
        checks: produceChecks(declared),
        removedTargetIds: approval.approvedTargetIds, preservedTargetIds: [], warnings: [],
      },
    }),
  }
  assert.equal(registry.register(transformer).ok, true, 'transformer admission')
  assert.equal(registry.register(verifier).ok, true, 'verifier admission')
  return registry
}

function passed(ids: readonly string[]): VerificationCheck[] { return ids.map(id => ({ id, name: id, status: 'passed' as const })) }

async function execute(declared: readonly string[], produceChecks: (declared: readonly string[]) => VerificationCheck[]) {
  const registry = buildRegistry(declared, produceChecks)
  const input = createMemoryInput(new Uint8Array([1, 2, 3, 4]), { id: 'check-input', filename: 'photo.chk', mimeType: MEDIA })
  const plan = { id: 'plan-1', status: 'ready' as const, identity: IDENTITY, input: input.descriptor, sourceFingerprint: 'fp', targets: [TARGET], removableTargetIds: ['check-target-0'], preservedTargetIds: [], warnings: [], requiresApproval: true as const, removableFieldIds: [], preservedFieldIds: [], removalWitnesses: [WITNESS] }
  const approval = { planId: 'plan-1', inputId: input.descriptor.id, sourceFingerprint: 'fp', identity: IDENTITY, approvedTargetIds: ['check-target-0'], approvedAt: 1 }
  return createProcessingBoundary(registry).execute({ operation: 'remove', input, plan, approval })
}

async function test(name: string, fn: () => void | Promise<void>) { await fn(); console.log(`PASS ${name}`) }

async function main() {
  await test('B3 declared [a,b] + actual [a,b] passes and stamps the canonical set', async () => {
    const result = await execute(['a', 'b'], passed)
    assert.equal(result.ok, false, 'untrusted synthetic verifier must not establish authority')
  })

  await test('B3 declared [a,b] + actual [made-up,b] fails', async () => {
    const result = await execute(['a', 'b'], () => passed(['made-up', 'b']))
    assert.equal(result.ok, false)
  })

  await test('B3 declared [a,b] + actual [a] fails (missing check)', async () => {
    const result = await execute(['a', 'b'], () => passed(['a']))
    assert.equal(result.ok, false)
  })

  await test('B3 declared [a,b] + actual [a,b,c] fails (extra check)', async () => {
    const result = await execute(['a', 'b'], () => passed(['a', 'b', 'c']))
    assert.equal(result.ok, false)
  })

  await test('B3 duplicate check identities fail', async () => {
    const result = await execute(['a', 'b'], () => passed(['a', 'a']))
    assert.equal(result.ok, false)
  })

  await test('B3 wrong check status fails', async () => {
    const result = await execute(['a', 'b'], declared => declared.map(id => ({ id, name: id, status: 'failed' as const })))
    assert.equal(result.ok, false)
  })

  await test('B3 not-run check status fails', async () => {
    const result = await execute(['a', 'b'], declared => declared.map(id => ({ id, name: id, status: 'not-run' as const })))
    assert.equal(result.ok, false)
  })

  await test('B3 empty actual check set fails', async () => {
    const result = await execute(['a', 'b'], () => [])
    assert.equal(result.ok, false)
  })

  await test('B3 expected set follows the verifier declaration, not a global constant', async () => {
    const result = await execute(['structural-frame', 'target-absent'], passed)
    assert.equal(result.ok, false)
    // An untrusted synthetic declaration cannot become an authority record.
  })

  await test('B3 a single declared check is honoured exactly', async () => {
    const good = await execute(['only'], passed)
    assert.equal(good.ok, false)
    const bad = await execute(['only'], () => passed(['only', 'sneaky']))
    assert.equal(bad.ok, false)
  })

  console.log('Verification check authority tests passed: 10')
}

void main()
