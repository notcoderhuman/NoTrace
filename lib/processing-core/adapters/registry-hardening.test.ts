import { strict as assert } from 'node:assert'
import { createFormatAdapterRegistry, type FormatAdapter } from './registry'
import { createProcessingBoundary } from '../../local-boundary/processing-boundary'
import { createMemoryInput } from '../domain/input'
import { createMemoryArtifact } from '../domain/artifact'
import type { AdapterConformance, AdapterContract, EvidenceRecord, ResourceContract, StaticCapabilityDeclaration } from '../domain/contracts'
import type { ProcessingIdentity } from '../domain/identity'
import type { RemovalApproval, RemovalPlan, RemovalTarget, RemovalWitness } from '../domain/operation'
import * as core from '../index'

/**
 * Regression tests for the v0.13.3 red-team pass.
 * B1 — adapter metadata mutation after admission must never grant registry authority.
 * B6 — malformed adapter input must fail closed with a typed result, never throw.
 * B3 (admission half) — the canonical declared check set is validated at admission.
 */

const MEDIA = 'text/x-check-test'
const IDENTITY: ProcessingIdentity = { formatId: 'check-test', engineId: 'check-test-engine', engineVersion: '1', capabilityKey: 'check-test:remove-target', policyId: 'check-test-policy', policyVersion: '1', verifierCompatibilityKey: 'check-test-v1' }
const DECLARED_CHECKS = ['container-intact', 'target-absent'] as const
const resource: ResourceContract = { inputBound: { maxBytes: 1024 * 1024, state: 'measured' }, fullBufferOperations: { state: 'inferred' }, streaming: { supported: false, state: 'measured' }, worker: { required: false, state: 'measured' }, transfer: { transferable: false, copies: true, state: 'inferred' }, temporaryAllocations: 'inferred', concurrency: { state: 'unmeasured' }, cancellationPoints: ['input read'] }
const inspectOk = async () => ({ ok: true as const, value: { kind: 'inspection' as const, status: 'success' as const, input: { filename: 'a.chk' }, format: { state: 'supported' as const }, fields: [], warnings: [], analyzed: true as const } })
const evidence: () => readonly EvidenceRecord[] = () => []

function declaration(over: Partial<StaticCapabilityDeclaration> = {}): StaticCapabilityDeclaration {
  return { formatId: 'check-test', operations: ['inspect', 'executeRemoval'], extensions: ['chk'], mimeTypes: [MEDIA], processingIdentity: IDENTITY, verifierCompatibilityKey: 'check-test-v1', verificationCheckIds: [...DECLARED_CHECKS], ...over }
}
function conformance(decl: StaticCapabilityDeclaration, over: Partial<AdapterConformance> = {}): AdapterConformance {
  return { level: 'removal-capable', declaration: decl, resource, ...over }
}
function transformer(over: Partial<FormatAdapter> = {}, declOver: Partial<StaticCapabilityDeclaration> = {}): FormatAdapter {
  const decl = declaration(declOver)
  const conf = conformance(decl)
  const contract: AdapterContract = { conformance: conf, evidence, inspect: inspectOk, executeRemoval: async () => ({ ok: false as const, error: { code: 'PROCESSING_FAILED' as const, message: 'not called' } }) }
  return {
    id: 'check-test-transformer', role: 'transformer', formatId: 'check-test', verifierCompatibilityKey: 'check-test-v1', verificationCheckIds: DECLARED_CHECKS,
    probe: async () => ({ ok: true as const, value: { formatId: 'check-test', mediaType: MEDIA, confidence: 'structural' as const } }),
    capability: { extensions: ['chk'], mimeTypes: [MEDIA], operations: ['inspect', 'remove'] },
    evidence, inspect: inspectOk, conformance: conf, contract,
    remove: async () => ({ ok: false as const, error: { code: 'PROCESSING_FAILED' as const, message: 'not called' } }),
    ...over,
  }
}
function verifier(declOver: Partial<StaticCapabilityDeclaration> = {}): FormatAdapter {
  const decl = declaration({ operations: ['verifyRemoval'], verificationCheckIds: DECLARED_CHECKS, ...declOver })
  const conf = conformance(decl, { level: 'verification-capable', independentVerifier: true })
  return {
    id: 'check-test-verifier', role: 'verifier', formatId: 'check-test', verifierCompatibilityKey: 'check-test-v1', verifierIndependence: 'structural-independent', verificationCheckIds: DECLARED_CHECKS,
    probe: async () => ({ ok: true as const, value: { formatId: 'check-test', mediaType: MEDIA, confidence: 'structural' as const } }),
    capability: { extensions: ['chk'], mimeTypes: [MEDIA], operations: ['verify'] },
    conformance: conf, contract: { conformance: conf },
    verifyOutput: async () => ({ ok: false as const, error: { code: 'VERIFICATION_FAILED' as const, message: 'not called' } }),
  }
}

async function test(name: string, fn: () => void | Promise<void>) { await fn(); console.log(`PASS ${name}`) }

async function main() {
  // ---------------------------------------------------------------
  // B1 — mutation after admission must never grant authority
  // ---------------------------------------------------------------
  await test('B1 mutation after admission cannot grant destructive authority', async () => {
    const registry = createFormatAdapterRegistry()
    let removeCalls = 0
    const adapter: FormatAdapter = {
      id: 'b1-mutant', role: 'transformer', formatId: 'check-test',
      probe: async () => ({ ok: true as const, value: { formatId: 'check-test', mediaType: MEDIA, confidence: 'structural' as const } }),
      capability: { extensions: ['chk'], mimeTypes: [MEDIA], operations: ['inspect'] },
      inspect: inspectOk,
    }
    assert.equal(registry.register(adapter).ok, true, 'inspect-only admission must stay compatible')

    // Mutate the caller-controlled object the registry was handed.
    ;(adapter.capability.operations as Operation[]).push('remove')
    ;(adapter as { verifierCompatibilityKey?: string }).verifierCompatibilityKey = 'check-test-v1'
    ;(adapter as { remove?: unknown }).remove = async () => { removeCalls += 1; return { ok: false as const, error: { code: 'PROCESSING_FAILED' as const, message: 'reached' } } }

    const input = createMemoryInput(new Uint8Array([1, 2, 3, 4]), { id: 'b1-input', filename: 'photo.chk', mimeType: MEDIA })
    const resolved = await registry.resolveVerified(input, 'remove')
    assert.equal(resolved.ok, false, 'mutated adapter must not resolve for destructive work')

    const target: RemovalTarget = { id: 'check-target-0', kind: 'format-target', marker: 0, ordinal: 0, startOffset: 0, endOffset: 4, category: 'comment', scope: 'check-test', classification: 'SAFE_TO_REMOVE', removable: true, reason: 'test' }
    const witness: RemovalWitness = { sourceFingerprint: 'fp', targetId: 'check-target-0', ordinal: 0, startOffset: 0, endOffset: 4, marker: 0, rangeLength: 4 }
    const plan: RemovalPlan = { id: 'plan-1', status: 'ready', identity: IDENTITY, input: input.descriptor, sourceFingerprint: 'fp', targets: [target], removableTargetIds: ['check-target-0'], preservedTargetIds: [], warnings: [], requiresApproval: true, removableFieldIds: [], preservedFieldIds: [], removalWitnesses: [witness] }
    const approval: RemovalApproval = { planId: 'plan-1', inputId: input.descriptor.id, sourceFingerprint: 'fp', identity: IDENTITY, approvedTargetIds: ['check-target-0'], approvedAt: 1 }
    const executed = await createProcessingBoundary(registry).execute({ operation: 'remove', input, plan, approval })
    assert.equal(executed.ok, false, 'destructive execution must fail closed')
    assert.equal(removeCalls, 0, 'the mutated remove implementation must never execute')
  })

  await test('B1 nested operations-array mutation cannot alter stored registry authority', () => {
    const registry = createFormatAdapterRegistry()
    const adapter = transformer()
    assert.equal(registry.register(adapter).ok, true)
    const stored = registry.list()[0]
    assert.equal(Object.isFrozen(stored), true)
    assert.equal(Object.isFrozen(stored.capability), true)
    assert.equal(Object.isFrozen(stored.capability.operations), true)

    const before = [...stored.capability.operations]
    ;(adapter.capability.operations as Operation[]).push('verify')
    ;(adapter.capability.operations as Operation[]).splice(0, adapter.capability.operations.length)
    assert.deepEqual([...stored.capability.operations], before, 'stored operations must be a registry-owned copy')
  })

  await test('B1 declaration mutation cannot alter stored registry authority', () => {
    const registry = createFormatAdapterRegistry()
    const adapter = transformer()
    const originalDeclaration = adapter.contract!.conformance.declaration as StaticCapabilityDeclaration
    assert.equal(registry.register(adapter).ok, true)
    const stored = registry.list()[0].contract!.conformance.declaration

    ;(originalDeclaration.operations as FormatOperationLike[]).push('verifyRemoval')
    ;(originalDeclaration.extensions as string[]).push('png')
    ;(originalDeclaration.mimeTypes as string[]).splice(0, originalDeclaration.mimeTypes.length)
    ;(originalDeclaration.verificationCheckIds as string[]).push('injected')

    assert.deepEqual([...stored.operations], ['inspect', 'executeRemoval'])
    assert.deepEqual([...stored.extensions], ['chk'])
    assert.deepEqual([...stored.mimeTypes], [MEDIA])
    assert.deepEqual([...stored.verificationCheckIds!], [...DECLARED_CHECKS])
    assert.equal(Object.isFrozen(stored.operations), true)
  })

  await test('B1 conformance mutation cannot alter stored registry authority', () => {
    const registry = createFormatAdapterRegistry()
    const adapter = transformer()
    assert.equal(registry.register(adapter).ok, true)
    const stored = registry.list()[0]
    ;(adapter.conformance as { independentVerifier?: boolean }).independentVerifier = false
    ;(adapter.contract!.conformance as { level: string }).level = 'inspect-only'
    assert.equal(stored.conformance?.independentVerifier, undefined)
    assert.equal(stored.conformance?.level, 'removal-capable')
    assert.equal(Object.isFrozen(stored.conformance), true)
    assert.equal(Object.isFrozen(stored.conformance!.declaration), true)
  })

  await test('B1 mutation cannot make an unverified adapter resolvable as a verifier', async () => {
    const registry = createFormatAdapterRegistry()
    assert.equal(registry.register(transformer()).ok, true)
    const fake: FormatAdapter = {
      id: 'b1-fake-verifier', role: 'verifier', formatId: 'check-test',
      probe: async () => ({ ok: true as const, value: { formatId: 'check-test', mediaType: MEDIA, confidence: 'structural' as const } }),
      capability: { extensions: ['chk'], mimeTypes: [MEDIA], operations: ['inspect'] },
      inspect: inspectOk,
    }
    assert.equal(registry.register(fake).ok, true)
    ;(fake.capability.operations as Operation[]).push('verify')
    ;(fake as { verifierCompatibilityKey?: string }).verifierCompatibilityKey = 'check-test-v1'
    ;(fake as { verifierIndependence?: string }).verifierIndependence = 'structural-independent'
    ;(fake as { verifyOutput?: unknown }).verifyOutput = async () => ({ ok: false as const, error: { code: 'VERIFICATION_FAILED' as const, message: 'reached' } })

    const input = createMemoryInput(new Uint8Array([1, 2, 3, 4]), { id: 'b1-v', filename: 'photo.chk', mimeType: MEDIA })
    const selected = await registry.resolveVerifiedVerifier(input, 'check-test-transformer', 'check-test-v1')
    assert.equal(selected.ok, false, 'mutated contract-less verifier must never be selected')
  })

  // ---------------------------------------------------------------
  // B6 — typed registry failure for malformed adapters
  // ---------------------------------------------------------------
  await test('B6 malformed adapters fail closed with a typed result and never throw', () => {
    const registry = createFormatAdapterRegistry()
    const cases: unknown[] = [undefined, null, {}, { id: '' }, { id: '   ' }, { id: 'x' }, { id: 'x', capability: null }, { id: 'x', capability: {} }, { id: 'x', capability: { extensions: 'nope', mimeTypes: [], operations: [] } }, { id: 'x', capability: { extensions: [], mimeTypes: [], operations: 'remove' } }]
    for (const candidate of cases) {
      let threw = false
      let result: { ok: boolean } | undefined
      try { result = registry.register(candidate as never) } catch { threw = true }
      assert.equal(threw, false, `register threw for ${JSON.stringify(candidate)}`)
      assert.equal(result?.ok, false, `register accepted ${JSON.stringify(candidate)}`)
      assert.equal(registry.list().length, 0)
    }
  })

  // ---------------------------------------------------------------
  // B3 (admission half) — canonical declared check set is validated
  // ---------------------------------------------------------------
  await test('B3 verifier declaring verifyRemoval without a check set is rejected', () => {
    const registry = createFormatAdapterRegistry()
    assert.equal(registry.register(verifier({ verificationCheckIds: undefined })).ok, false)
  })
  await test('B3 verifier declaring an empty check set is rejected', () => {
    const registry = createFormatAdapterRegistry()
    assert.equal(registry.register(verifier({ verificationCheckIds: [] })).ok, false)
  })
  await test('B3 verifier declaring duplicate check identities is rejected', () => {
    const registry = createFormatAdapterRegistry()
    assert.equal(registry.register(verifier({ verificationCheckIds: ['dup', 'dup'] })).ok, false)
  })
  await test('B3 verifier declaring blank check identities is rejected', () => {
    const registry = createFormatAdapterRegistry()
    assert.equal(registry.register(verifier({ verificationCheckIds: ['ok', '  '] })).ok, false)
  })
  await test('B3 adapter check ids diverging from its declaration are rejected', () => {
    const registry = createFormatAdapterRegistry()
    assert.equal(registry.register({ ...verifier(), verificationCheckIds: ['made-up'] }).ok, false)
  })
  await test('B3 matching declared and adapter check ids are accepted', () => {
    const registry = createFormatAdapterRegistry()
    assert.equal(registry.register(verifier()).ok, true)
  })

  // ---------------------------------------------------------------
  // Public surface
  // ---------------------------------------------------------------
  await test('public surface exposes the independent verifier and hides the non-independent one', () => {
    const surface = core as unknown as Record<string, unknown>
    assert.equal(typeof surface.jpegVerifierAdapter, 'object')
    assert.equal(typeof surface.verifyJpegOutputIndependently, 'function')
    assert.equal('verifyJpegOutput' in surface, false, 'the non-independent verifier must not be exported')
    assert.equal(typeof surface.jpegAdapter, 'object')
  })

  // ---------------------------------------------------------------
  // Positive control — the real JPEG pair still registers and resolves
  // ---------------------------------------------------------------
  await test('B1/B6 hardening keeps the production JPEG path admissible', async () => {
    const registry = createFormatAdapterRegistry()
    const { jpegAdapter } = await import('./jpeg')
    const { jpegVerifierAdapter } = await import('./jpeg-verifier')
    assert.equal(registry.register(jpegAdapter).ok, true)
    assert.equal(registry.register(jpegVerifierAdapter).ok, true)
    const input = createMemoryInput(new Uint8Array([0xff, 0xd8]), { id: 'jpeg-probe', filename: 'x.jpg', mimeType: 'image/jpeg' })
    assert.equal((await registry.resolveVerified(input, 'inspect')).ok, true)
    const selected = await registry.resolveVerifiedVerifier(input, 'jpeg-inspection', 'notrace-jpeg-com-v1')
    assert.equal(selected.ok, true)
    assert.equal(selected.ok ? selected.value.id : undefined, 'jpeg-verifier')
  })

  console.log('Registry hardening tests passed: 14')
}

type Operation = 'inspect' | 'remove' | 'edit' | 'verify'
type FormatOperationLike = 'inspect' | 'planRemoval' | 'executeRemoval' | 'verifyRemoval' | 'edit' | 'provenanceRead' | 'provenanceWrite' | 'watermarkAnalysis' | 'watermarkRemoval'

void main()
