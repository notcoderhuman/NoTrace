import type { LocalInput } from '../domain/input'
import type { OutputArtifact } from '../domain/artifact'
import type { RemovalApproval, RemovalPlan, RemovalWitness } from '../domain/operation'
import type { BoundaryResult, VerificationResult } from '../domain/result'
import type { AdapterContract } from '../domain/contracts'
import { PNG_PROCESSING_IDENTITY, PNG_VERIFICATION_CHECK_IDS } from './png'
const PNG_SCOPE = Object.freeze({ formatId: 'png', scopeId: 'png-text' })
import { scanPngForVerification, type VerifierPngChunk } from './png-verifier-scanner'

function same(a: Uint8Array, b: Uint8Array, signal?: AbortSignal): boolean { for (let i = 0; i < a.length; i++) { if (signal?.aborted) return false; if (a[i] !== b[i]) return false } return a.length === b.length }
function fail(message: string): BoundaryResult<never> { return { ok: false, error: { code: 'VERIFICATION_FAILED', message } } }
function witnessFor(chunk: VerifierPngChunk, fingerprint: string): RemovalWitness { return { sourceFingerprint: fingerprint, targetId: chunk.id, identity: { formatId: 'png', typeId: chunk.type, ordinal: chunk.ordinal, startOffset: chunk.startOffset, endOffset: chunk.endOffset }, ordinal: chunk.ordinal, startOffset: chunk.startOffset, endOffset: chunk.endOffset, marker: 0, rangeLength: chunk.endOffset - chunk.startOffset } }
export async function verifyPngOutputIndependently(input: LocalInput, output: OutputArtifact, plan: RemovalPlan, approval: RemovalApproval, signal?: AbortSignal): Promise<BoundaryResult<VerificationResult>> {
  const sourceRead = await input.read(undefined, signal); if (!sourceRead.ok) return sourceRead
  const sourceAgain = await input.read(undefined, signal); if (!sourceAgain.ok) return sourceAgain
  if (!same(sourceRead.value, sourceAgain.value, signal)) return signal?.aborted ? { ok: false, error: { code: 'CANCELLED', message: 'PNG verification was cancelled.' } } : fail('PNG source changed during verification.')
  const sourceInventory = await scanPngForVerification({ ...input, read: async () => ({ ok: true as const, value: sourceRead.value }) } as LocalInput, signal); if (!sourceInventory.ok) return sourceInventory
  if (sourceInventory.value.sourceFingerprint !== plan.sourceFingerprint || approval.sourceFingerprint !== sourceInventory.value.sourceFingerprint) return fail('PNG source fingerprint does not match the plan.')
  if (plan.identity.formatId !== 'png' || plan.identity.verifierCompatibilityKey !== PNG_PROCESSING_IDENTITY.verifierCompatibilityKey || approval.identity.verifierCompatibilityKey !== plan.identity.verifierCompatibilityKey) return fail('PNG processing identity is invalid.')
  const approved = approval.approvedTargetIds
  if (new Set(approved).size !== approved.length) return fail('PNG approval contains duplicate target IDs.')
  const sourceById = new Map(sourceInventory.value.chunks.map(chunk => [chunk.id, chunk]))
  const approvedChunks: VerifierPngChunk[] = []
  for (const id of approved) { const chunk = sourceById.get(id); if (!chunk || !chunk.removable || chunk.type !== 'tEXt' || !chunk.scope || chunk.scope.formatId !== PNG_SCOPE.formatId || chunk.scope.scopeId !== PNG_SCOPE.scopeId) return fail('Approved PNG target is not independently removable.'); approvedChunks.push(chunk) }
  const witnesses = approvedChunks.map(chunk => witnessFor(chunk, sourceInventory.value.sourceFingerprint))
  const planWitnesses = new Map(plan.removalWitnesses.map(w => [w.targetId, w]))
  for (const witness of witnesses) { const planned = planWitnesses.get(witness.targetId); if (!planned || planned.ordinal !== witness.ordinal || planned.startOffset !== witness.startOffset || planned.endOffset !== witness.endOffset || planned.rangeLength !== witness.rangeLength || planned.sourceFingerprint !== witness.sourceFingerprint) return fail('PNG removal witness does not match independently scanned source.') }
  const generated = await output.read(undefined, signal); if (!generated.ok) return generated
  if (output.mediaType !== 'image/png' || output.id === input.descriptor.id || output.size !== generated.value.length) return fail('PNG artifact metadata is invalid.')
  const outputInput = { ...input, descriptor: { ...input.descriptor, size: generated.value.length }, read: async () => ({ ok: true as const, value: generated.value }) } as LocalInput
  const outputInventory = await scanPngForVerification(outputInput, signal); if (!outputInventory.ok) return outputInventory
  const removedSet = new Set(approved)
  const retained = sourceInventory.value.chunks.filter(chunk => !removedSet.has(chunk.id))
  const outputChunks = outputInventory.value.chunks
  if (outputChunks.length !== retained.length) return fail('PNG output chunk count does not match exact retained source chunks.')
  for (let i = 0; i < retained.length; i++) { if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'PNG verification was cancelled.' } }; if (outputChunks[i].type !== retained[i].type || !same(outputChunks[i].data, retained[i].data, signal)) return fail('PNG retained chunks changed or reordered.') }
  const expectedBytes = new Uint8Array(sourceRead.value.length - approvedChunks.reduce((n, chunk) => n + chunk.endOffset - chunk.startOffset, 0)); let src = 0, dst = 0
  for (const chunk of sourceInventory.value.chunks) { if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'PNG verification was cancelled.' } }; if (removedSet.has(chunk.id)) { if (chunk.startOffset < src || chunk.endOffset > sourceRead.value.length) return fail('PNG deleted range is invalid.'); expectedBytes.set(sourceRead.value.subarray(src, chunk.startOffset), dst); dst += chunk.startOffset - src; src = chunk.endOffset } }
  expectedBytes.set(sourceRead.value.subarray(src), dst)
  if (!same(expectedBytes, generated.value, signal)) return fail('PNG output is not the exact concatenation of retained source ranges.')
  const checks = PNG_VERIFICATION_CHECK_IDS.map(id => ({ id, name: id, status: 'passed' as const }))
  return { ok: true, value: { kind: 'verification', status: 'success', identity: PNG_PROCESSING_IDENTITY, input: input.descriptor, outputCreated: true, output, sourceFingerprint: sourceInventory.value.sourceFingerprint, planId: plan.id, inputId: input.descriptor.id, approvedTargetIds: approved, removalTrace: witnesses, checks, removedTargetIds: approved, preservedTargetIds: plan.targets.filter(t => !removedSet.has(t.id)).map(t => t.id), warnings: [] } }
}
const pngVerifierContract: AdapterContract = { conformance: { level: 'verification-capable', declaration: { formatId: 'png', operations: ['verifyRemoval'], extensions: ['png'], mimeTypes: ['image/png'], processingIdentity: PNG_PROCESSING_IDENTITY, verifierCompatibilityKey: PNG_PROCESSING_IDENTITY.verifierCompatibilityKey, verificationCheckIds: PNG_VERIFICATION_CHECK_IDS }, resource: { inputBound: { maxBytes: 32 * 1024 * 1024, state: 'measured' }, fullBufferOperations: { state: 'measured' }, streaming: { supported: false, state: 'measured' }, worker: { required: false, state: 'measured' }, transfer: { transferable: false, copies: true, state: 'inferred' }, temporaryAllocations: 'inferred', concurrency: { state: 'unmeasured' }, cancellationPoints: ['input read', 'scan', 'fingerprint', 'verification'] }, independentVerifier: true }, verifyRemoval: async (context, output, plan, approval) => verifyPngOutputIndependently(context.input, output, plan, approval, context.signal) }
export const pngVerifierAdapter = { id: 'png-verifier', role: 'verifier' as const, formatId: 'png', engineId: 'notrace-png', engineVersion: '1', capabilityKey: 'png:verify', verifierCompatibilityKey: PNG_PROCESSING_IDENTITY.verifierCompatibilityKey, verifierIndependence: 'structural-independent' as const, verificationCheckIds: PNG_VERIFICATION_CHECK_IDS, probe: async (input: LocalInput, signal?: AbortSignal) => { const prefix = await input.read({ offset: 0, length: 8 }, signal); if (!prefix.ok) return prefix; return prefix.value.every((b, i) => b === PNG_SIGNATURE[i]) ? { ok: true as const, value: { formatId: 'png', mediaType: 'image/png', confidence: 'structural' as const } } : { ok: false as const, error: { code: 'UNSUPPORTED' as const, message: 'Input is not PNG.' } } }, capability: { extensions: ['png'], mimeTypes: ['image/png'], operations: ['verify'] as const }, conformance: pngVerifierContract.conformance, contract: pngVerifierContract, verifyOutput: verifyPngOutputIndependently }
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
