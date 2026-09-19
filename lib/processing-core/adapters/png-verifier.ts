import type { LocalInput } from '../domain/input'
import type { OutputArtifact } from '../domain/artifact'
import type { RemovalApproval, RemovalPlan } from '../domain/operation'
import type { BoundaryResult, VerificationResult } from '../domain/result'
import { PNG_PROCESSING_IDENTITY, PNG_VERIFICATION_CHECK_IDS, scanPng } from './png'
import type { AdapterContract } from '../domain/contracts'

function same(a: Uint8Array, b: Uint8Array) { return a.length === b.length && a.every((v, i) => v === b[i]) }
export async function verifyPngOutputIndependently(input: LocalInput, output: OutputArtifact, plan: RemovalPlan, approval: RemovalApproval, signal?: AbortSignal): Promise<BoundaryResult<VerificationResult>> {
  const source = await input.read(undefined, signal); if (!source.ok) return source
  const sourceAgain = await input.read(undefined, signal); if (!sourceAgain.ok || !same(source.value, sourceAgain.value)) return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'PNG source changed during verification.' } }
  const generated = await output.read(undefined, signal); if (!generated.ok) return generated
  if (output.mediaType !== 'image/png' || output.id === input.descriptor.id || output.size !== generated.value.length) return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'PNG artifact metadata is invalid.' } }
  const sourceInventory = await scanPng({ ...input, read: async (_range?: any, _signal?: AbortSignal) => ({ ok: true as const, value: source.value }) } as LocalInput, signal)
  const outputInput = { ...input, descriptor: { ...input.descriptor, size: generated.value.length }, read: async (_range?: any, _signal?: AbortSignal) => ({ ok: true as const, value: generated.value }) } as LocalInput
  const outputInventory = await scanPng(outputInput, signal)
  if (!sourceInventory.ok || !outputInventory.ok) return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'PNG structural verification failed.' } }
  const approved = new Set(approval.approvedTargetIds)
  const sourceChunks = sourceInventory.value.chunks
  const outputChunks = outputInventory.value.chunks
  const retained = sourceChunks.filter(chunk => !approved.has(chunk.id))
  if (outputChunks.length !== retained.length || outputChunks.some((chunk, i) => chunk.type !== retained[i].type || !same(chunk.data, retained[i].data))) return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'PNG retained chunks changed or reordered.' } }
  const checks = PNG_VERIFICATION_CHECK_IDS.map(id => ({ id, name: id, status: 'passed' as const }))
  return { ok: true, value: { kind: 'verification', status: 'success', identity: PNG_PROCESSING_IDENTITY, input: input.descriptor, outputCreated: true, output, sourceFingerprint: plan.sourceFingerprint, planId: plan.id, inputId: input.descriptor.id, approvedTargetIds: approval.approvedTargetIds, removalTrace: plan.removalWitnesses, checks, removedTargetIds: approval.approvedTargetIds, preservedTargetIds: plan.targets.filter(t => !approved.has(t.id)).map(t => t.id), warnings: [] } }
}
const pngVerifierContract: AdapterContract = { conformance: { level: 'verification-capable', declaration: { ...({ formatId: 'png', operations: ['verifyRemoval'], extensions: ['png'], mimeTypes: ['image/png'], processingIdentity: PNG_PROCESSING_IDENTITY, verifierCompatibilityKey: PNG_PROCESSING_IDENTITY.verifierCompatibilityKey, verificationCheckIds: PNG_VERIFICATION_CHECK_IDS }) }, resource: { inputBound: { maxBytes: 32 * 1024 * 1024, state: 'measured' }, fullBufferOperations: { state: 'measured' }, streaming: { supported: false, state: 'measured' }, worker: { required: false, state: 'measured' }, transfer: { transferable: false, copies: true, state: 'inferred' }, temporaryAllocations: 'inferred', concurrency: { state: 'unmeasured' }, cancellationPoints: ['input read', 'scan'] }, independentVerifier: true }, verifyRemoval: async (context, output, plan, approval) => verifyPngOutputIndependently(context.input, output, plan, approval, context.signal) }
export const pngVerifierAdapter = { id: 'png-verifier', role: 'verifier' as const, formatId: 'png', engineId: 'notrace-png', engineVersion: '1', capabilityKey: 'png:verify', verifierCompatibilityKey: PNG_PROCESSING_IDENTITY.verifierCompatibilityKey, verifierIndependence: 'structural-independent' as const, verificationCheckIds: PNG_VERIFICATION_CHECK_IDS, probe: async (input: LocalInput, signal?: AbortSignal) => { const prefix = await input.read({ offset: 0, length: 8 }, signal); if (!prefix.ok) return prefix; return prefix.value.every((b, i) => b === [137,80,78,71,13,10,26,10][i]) ? { ok: true as const, value: { formatId: 'png', mediaType: 'image/png', confidence: 'structural' as const } } : { ok: false as const, error: { code: 'UNSUPPORTED' as const, message: 'Input is not PNG.' } } }, capability: { extensions: ['png'], mimeTypes: ['image/png'], operations: ['verify'] as const }, conformance: pngVerifierContract.conformance, contract: pngVerifierContract, verifyOutput: verifyPngOutputIndependently }
