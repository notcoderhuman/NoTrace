import { strict as assert } from 'node:assert'
import { createMemoryArtifact } from '../domain/artifact'
import { createMemoryInput } from '../domain/input'
import type { ProcessingIdentity } from '../domain/identity'
import type { RemovalApproval, RemovalPlan, RemovalTarget } from '../domain/operation'
import type { BoundaryResult, VerificationResult } from '../domain/result'
import { createFormatAdapterRegistry, type FormatAdapter } from './registry'
import { createProcessingBoundary } from '../../local-boundary/processing-boundary'
import { createDefaultFormatAdapterRegistry } from '../../local-boundary/default-registry'

/** Test-only format. This module is never imported by default-registry, provider, or UI. */
const FORMAT = 'test-text'
const MEDIA = 'text/x-notrace-test'
const PREFIX = new Uint8Array([0x4e, 0x54, 0x58, 0x54, 0]) // NTXT\0
const MARKER = '[REMOVE]'
const IDENTITY: ProcessingIdentity = { formatId: FORMAT, engineId: 'test-text-engine', engineVersion: '1', capabilityKey: 'test-text:remove-marker', policyId: 'test-text-policy', policyVersion: '1', verifierCompatibilityKey: 'test-text-v1' }
const CHECKS = ['text-container', 'marker-absent', 'retained-content', 'distinct-artifact'] as const
const encode = (value: string) => new TextEncoder().encode(value)
const decode = (value: Uint8Array) => new TextDecoder().decode(value)
const concat = (a: Uint8Array, b: Uint8Array) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out }
async function hash(bytes: Uint8Array): Promise<string> { const digest = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') }
function isFixture(bytes: Uint8Array): boolean { return bytes.length >= PREFIX.length && PREFIX.every((value, index) => bytes[index] === value) }
function target(bytes: Uint8Array): RemovalTarget {
  const startOffset = PREFIX.length
  const endOffset = bytes.length
  return { id: 'test-text-marker-0', kind: 'format-target', marker: 0, ordinal: 0, startOffset, endOffset, category: 'comment', classification: 'SAFE_TO_REMOVE', removable: true, reason: 'Explicit test marker.' }
}

export function createTestTextFixture(content = `keep ${MARKER} protected`): Uint8Array { return concat(PREFIX, encode(content)) }

export function createTestTextAdapters(): { transformer: FormatAdapter; verifier: FormatAdapter } {
  const capability = { extensions: ['ntxt'], mimeTypes: [MEDIA], operations: ['inspect', 'remove'] as const }
  const verifierCapability = { extensions: ['ntxt'], mimeTypes: [MEDIA], operations: ['verify'] as const }
  const transformer: FormatAdapter = {
    id: 'test-text-transformer', role: 'transformer', formatId: FORMAT, engineId: IDENTITY.engineId, engineVersion: IDENTITY.engineVersion, capabilityKey: IDENTITY.capabilityKey, verifierCompatibilityKey: 'test-text-v1', verificationCheckIds: CHECKS,
    probe: async () => ({ ok: true as const, value: { formatId: FORMAT, mediaType: MEDIA, confidence: 'structural' as const } }),
    capability,
    planRemoval: async (input, ids) => {
      const read = await input.read(); if (!read.ok) return read
      if (!isFixture(read.value)) return { ok: false, error: { code: 'UNSUPPORTED', message: 'Not a test-text fixture.' } }
      const sourceFingerprint = await hash(read.value)
      const t = target(read.value)
      const selected = ids.length === 0 ? [t.id] : ids
      const chosen = selected.includes(t.id) ? [t.id] : []
      const plan: RemovalPlan = { id: `plan-${input.descriptor.id}`, status: chosen.length ? 'ready' : 'unsupported', identity: IDENTITY, input: input.descriptor, sourceFingerprint, targets: [t], removableTargetIds: chosen, preservedTargetIds: chosen.length ? [] : [t.id], warnings: [], requiresApproval: true, removableFieldIds: [], preservedFieldIds: [], removalWitnesses: chosen.length ? [{ sourceFingerprint, targetId: t.id, ordinal: t.ordinal, startOffset: t.startOffset, endOffset: t.endOffset, marker: t.marker, rangeLength: t.endOffset - t.startOffset }] : [] }
      return { ok: true, value: plan }
    },
    remove: async (input, plan, approval) => {
      if (plan.identity?.formatId !== FORMAT || approval.planId !== plan.id || approval.inputId !== input.descriptor.id || approval.sourceFingerprint !== plan.sourceFingerprint || approval.approvedTargetIds.length !== 1 || approval.approvedTargetIds[0] !== 'test-text-marker-0') return { ok: false, error: { code: 'INVALID_INPUT', message: 'Test-text approval binding failed.' } }
      const read = await input.read(); if (!read.ok) return read
      const body = decode(read.value.slice(PREFIX.length))
      const markerIndex = body.indexOf(MARKER)
      if (!isFixture(read.value) || markerIndex < 0) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Test marker is absent.' } }
      const outputBytes = concat(PREFIX, encode(body.slice(0, markerIndex) + body.slice(markerIndex + MARKER.length)))
      const artifact = createMemoryArtifact(outputBytes, 'verified.ntxt', MEDIA)
      return { ok: true, value: { kind: 'processing', status: 'success', input: input.descriptor, output: { filename: artifact.filename, created: true, artifact }, outputVerification: 'not-run', removalTrace: plan.removalWitnesses, removedTargetIds: ['test-text-marker-0'], preservedTargetIds: [], warnings: [] } }
    },
  }
  const verifier: FormatAdapter = {
    id: 'test-text-verifier', role: 'verifier',
    probe: async () => ({ ok: true as const, value: { formatId: FORMAT, mediaType: MEDIA, confidence: 'structural' as const } }), formatId: FORMAT, engineId: IDENTITY.engineId, engineVersion: IDENTITY.engineVersion, capabilityKey: 'test-text:verify', verifierCompatibilityKey: 'test-text-v1', verifierIndependence: 'structural-independent', verificationCheckIds: CHECKS, capability: verifierCapability,
    verifyOutput: async (input, output, plan, approval): Promise<BoundaryResult<VerificationResult>> => {
      const original = await input.read(); if (!original.ok) return original
      const generated = await output.read(); if (!generated.ok) return generated
      // Independent parser: it does not call the transformer's body parser or search logic.
      if (!isFixture(generated.value) || decode(generated.value.slice(PREFIX.length)).includes(MARKER)) return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Test marker remains or container is invalid.' } }
      if (output.id === input.descriptor.id || plan.identity?.formatId !== FORMAT) return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Test-text identity binding failed.' } }
      const sourceFingerprint = await hash(original.value)
      if (sourceFingerprint !== plan.sourceFingerprint || approval.sourceFingerprint !== sourceFingerprint) return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Source binding failed.' } }
      const checks = CHECKS.map(id => ({ id, name: id, status: 'passed' as const }))
      return { ok: true, value: { kind: 'verification', identity: IDENTITY, status: 'success', input: input.descriptor, outputCreated: true, output, sourceFingerprint, planId: plan.id, inputId: input.descriptor.id, approvedTargetIds: approval.approvedTargetIds, removalTrace: plan.removalWitnesses, checks, removedTargetIds: approval.approvedTargetIds, preservedTargetIds: [], warnings: [] } }
    },
  }
  return { transformer, verifier }
}

async function main() {
  const fixture = createTestTextFixture()
  const input = createMemoryInput(fixture, { id: 'test-text-input', filename: 'fixture.ntxt', mimeType: MEDIA })
  const adapters = createTestTextAdapters()
  const local = createFormatAdapterRegistry()
  assert.equal(local.register(adapters.transformer).ok, true)
  assert.equal(local.register(adapters.verifier).ok, true)
  const boundary = createProcessingBoundary(local)
  const planResult = await boundary.planRemoval({ input, fieldIds: ['test-text-marker-0'], policy: 'test-text-policy' })
  assert.equal(planResult.ok, true); if (!planResult.ok) return
  const approval = { planId: planResult.value.id, inputId: input.descriptor.id, sourceFingerprint: planResult.value.sourceFingerprint, identity: planResult.value.identity, approvedTargetIds: ['test-text-marker-0'], approvedAt: 1 }
  const result = await boundary.execute({ operation: 'remove', input, plan: planResult.value, approval })
  assert.equal(result.ok, true); if (result.ok) { assert.equal(result.value.outputVerification, 'passed'); result.value.output?.artifact.dispose() }
  const production = createDefaultFormatAdapterRegistry()
  assert.equal(production.list().some(adapter => adapter.formatId === FORMAT), false)
  assert.equal(production.resolve({ id: 'x', filename: 'x.ntxt', mimeType: MEDIA, source: 'memory', size: fixture.length }, 'remove').ok, false)
  const mismatch = createFormatAdapterRegistry(); mismatch.register(adapters.transformer); mismatch.register({ ...adapters.verifier, verifierCompatibilityKey: 'wrong' })
  const mismatchResult = await createProcessingBoundary(mismatch).execute({ operation: 'remove', input, plan: planResult.value, approval }); assert.equal(mismatchResult.ok, false)
  const forgedOutput = createMemoryArtifact(createTestTextFixture('keep [REMOVE]'), 'forged.ntxt', MEDIA)
  const forgedVerification = await adapters.verifier.verifyOutput!(input, forgedOutput, planResult.value, approval); assert.equal(forgedVerification.ok, false); forgedOutput.dispose()
  const malformed = createMemoryInput(new Uint8Array([1, 2, 3]), { id: 'malformed', filename: 'bad.ntxt', mimeType: MEDIA })
  const malformedPlan = await boundary.planRemoval({ input: malformed, fieldIds: ['test-text-marker-0'], policy: 'test-text-policy' }); assert.equal(malformedPlan.ok, false)
  console.log('Test-only non-JPEG adapter tests passed: 7')
}
void main()
