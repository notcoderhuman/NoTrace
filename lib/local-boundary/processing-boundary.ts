import { canonicalVerificationCheckIds, type FormatAdapterRegistry } from '../processing-core/adapters/registry'
import type { LocalProcessingBoundary, BoundaryOptions } from '../processing-core/domain/boundary'
import type { LocalInput } from '../processing-core/domain/input'
import type { InspectionResult } from '../processing-core/domain/metadata'
import type { ProcessingResult, RemovalPlan } from '../processing-core/domain/operation'
import { createMemoryArtifact, disposeArtifact, type OutputArtifact } from '../processing-core/domain/artifact'
import { type BoundaryResult, type VerificationResult } from '../processing-core/domain/result'
import { sameProcessingIdentity } from '../processing-core/domain/identity'
import { validateRemovalApproval } from '../processing-core/classification/policy'

function validate(input: LocalInput): BoundaryResult<void> {
  const descriptor = input.descriptor
  const sources = ['browser-file', 'blob', 'stream', 'filesystem-handle', 'opaque', 'memory']
  if (typeof descriptor.id !== 'string' || !descriptor.id.trim() || descriptor.id.length > 256 || typeof descriptor.filename !== 'string' || !descriptor.filename.trim() || descriptor.filename.length > 255) return { ok: false, error: { code: 'INVALID_INPUT', message: 'A bounded local input identity and filename are required.' } }
  if (!sources.includes(descriptor.source) || (descriptor.size !== undefined && (!Number.isSafeInteger(descriptor.size) || descriptor.size < 0))) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Local input descriptor is invalid.' } }
  return { ok: true, value: undefined }
}

/** Returned artifacts are observable only through the typed result envelope. */
function observedArtifacts(value: unknown): OutputArtifact[] {
  const candidates = [
    (value as { value?: { output?: { artifact?: OutputArtifact } } } | undefined)?.value?.output?.artifact,
    (value as { error?: { output?: { artifact?: OutputArtifact } } } | undefined)?.error?.output?.artifact,
    (value as { value?: { artifact?: OutputArtifact } } | undefined)?.value?.artifact,
    (value as { error?: { artifact?: OutputArtifact } } | undefined)?.error?.artifact,
  ]
  return candidates.filter((artifact, index): artifact is OutputArtifact => Boolean(artifact && typeof artifact.dispose === 'function' && candidates.indexOf(artifact) === index))
}
function disposeObserved(value: unknown): void { for (const artifact of observedArtifacts(value)) disposeArtifact(artifact) }
function disposePair(first: OutputArtifact | undefined, second?: OutputArtifact): void { disposeArtifact(first); if (second && second !== first) disposeArtifact(second) }

async function validVerification(request: any, verified: any, executionArtifact: OutputArtifact, expectedCheckIds: readonly string[] | undefined, expectedMediaType?: string): Promise<boolean> {
  if (!expectedCheckIds || expectedCheckIds.length === 0 || new Set(expectedCheckIds).size !== expectedCheckIds.length || !verified.kind || verified.kind !== 'verification' || !verified.output || verified.status !== 'success' || verified.outputCreated !== true || verified.output !== executionArtifact || typeof verified.output.dispose !== 'function' || typeof verified.output.read !== 'function' || !Number.isSafeInteger(verified.output.size) || verified.output.size < 0 || typeof verified.output.mediaType !== 'string' || (expectedMediaType && verified.output.mediaType !== expectedMediaType) || !sameProcessingIdentity(verified.identity, request.plan.identity)) return false
  const actual = await verified.output.read()
  if (!actual.ok || actual.value.byteLength !== verified.output.size || actual.value.byteLength > 32 * 1024 * 1024) return false
  if (!Array.isArray(verified.checks) || !Array.isArray(verified.approvedTargetIds) || !Array.isArray(verified.removalTrace) || !Array.isArray(verified.removedTargetIds) || !Array.isArray(verified.preservedTargetIds)) return false
  if (verified.checks.length !== expectedCheckIds.length || new Set(verified.checks.map((check: any) => check.id)).size !== verified.checks.length) return false
  if (verified.checks.some((check: any) => typeof check.id !== 'string' || typeof check.name !== 'string' || check.status !== 'passed' || !check.id.trim() || !check.name.trim() || !expectedCheckIds.includes(check.id))) return false
  if (expectedCheckIds.some(id => !verified.checks.some((check: any) => check.id === id))) return false
  if (!request.approval.identity || !sameProcessingIdentity(request.approval.identity, request.plan.identity) || verified.sourceFingerprint !== request.plan.sourceFingerprint || verified.planId !== request.plan.id || verified.inputId !== request.input.descriptor.id) return false
  if (verified.approvedTargetIds.length !== request.approval.approvedTargetIds.length || verified.approvedTargetIds.some((id: string, index: number) => id !== request.approval.approvedTargetIds[index])) return false
  if (verified.removalTrace.length !== request.approval.approvedTargetIds.length) return false
  if (verified.removalTrace.some((trace: any, index: number) => { const witness = request.plan.removalWitnesses.find((candidate: any) => candidate.targetId === request.approval.approvedTargetIds[index]); const target = request.plan.targets.find((candidate: any) => candidate.id === request.approval.approvedTargetIds[index]); return !witness || !target || trace.sourceFingerprint !== witness.sourceFingerprint || trace.targetId !== witness.targetId || trace.identity?.formatId !== request.plan.identity.formatId || trace.identity?.typeId !== target.typeId || trace.identity?.ordinal !== target.ordinal || trace.identity?.startOffset !== target.startOffset || trace.identity?.endOffset !== target.endOffset || trace.ordinal !== target.ordinal || trace.startOffset !== target.startOffset || trace.endOffset !== target.endOffset || trace.marker !== target.marker || trace.rangeLength !== target.endOffset - target.startOffset })) return false
  if (verified.removedTargetIds.length !== request.approval.approvedTargetIds.length || verified.removedTargetIds.some((id: string, index: number) => id !== request.approval.approvedTargetIds[index])) return false
  const expectedPreservedTargetIds = request.plan.targets.filter((target: any) => !request.approval.approvedTargetIds.includes(target.id)).map((target: any) => target.id)
  if (verified.preservedTargetIds.length !== expectedPreservedTargetIds.length || verified.preservedTargetIds.some((id: string, index: number) => id !== expectedPreservedTargetIds[index])) return false
  return true
}

export function createProcessingBoundary(registry: FormatAdapterRegistry): LocalProcessingBoundary {
  return {
    async inspect(input, options): Promise<BoundaryResult<InspectionResult>> {
      const valid = validate(input); if (!valid.ok) return valid
      if (options?.signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Inspection was cancelled.' } }
      const adapter = await registry.resolveVerified(input, 'inspect', options?.signal)
      if (!adapter.ok || !adapter.value.inspect) return { ok: false, error: { code: 'UNSUPPORTED', message: 'No inspection adapter is available for this input.' } }
      try { return await adapter.value.inspect(input, options?.signal) } catch { return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Local inspection could not be completed.' } } }
    },
    async planRemoval(request, options): Promise<BoundaryResult<RemovalPlan>> {
      const valid = validate(request.input); if (!valid.ok) return valid
      if (options?.signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Removal planning was cancelled.' } }
      const adapter = await registry.resolveVerified(request.input, 'inspect', options?.signal)
      if (!adapter.ok || !adapter.value.planRemoval) return { ok: false, error: { code: 'UNSUPPORTED', message: 'No removal planning adapter is available for this input.' } }
      try { return await adapter.value.planRemoval(request.input, request.fieldIds, request.policy, options?.signal) } catch { return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Local removal planning could not be completed.' } } }
    },
    async execute(request, options): Promise<BoundaryResult<ProcessingResult>> {
      const valid = validate(request.input); if (!valid.ok) return valid
      if (!('operation' in request) || request.operation !== 'remove' || !request.plan || !request.approval || !validateRemovalApproval(request.approval, request.plan) || request.plan.input.id !== request.input.descriptor.id || request.plan.input.filename !== request.input.descriptor.filename) return { ok: false, error: { code: 'INVALID_INPUT', message: 'A valid approved removal plan is required.' } }
      if (options?.signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } }
      const adapter = await registry.resolveVerified(request.input, 'remove', options?.signal)
      if (!adapter.ok) return adapter.error.code === 'CANCELLED' ? adapter : { ok: false, error: { code: 'UNSUPPORTED', message: 'No identity-bound removal execution adapter is available for this plan.' } }
       if (!adapter.value.remove || !sameProcessingIdentity(adapter.value.contract?.conformance.declaration.processingIdentity, request.plan.identity)) return { ok: false, error: { code: 'UNSUPPORTED', message: 'No identity-bound removal execution adapter is available for this plan.' } }
      let execution: BoundaryResult<ProcessingResult>
      try { execution = await adapter.value.remove(request.input, request.plan, request.approval, options?.signal) } catch (error) { disposeObserved(error); return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Local processing could not be completed.' } } }
      if (!execution.ok) { disposeObserved(execution); return execution }
      if (!execution.value.output) { disposeObserved(execution); return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Processing did not create an output artifact.' } } }
      const executorArtifact = execution.value.output.artifact
       if (!executorArtifact || typeof executorArtifact !== 'object' || typeof executorArtifact.read !== 'function' || typeof executorArtifact.dispose !== 'function') { disposeObserved(execution); return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Processing returned an invalid output artifact.' } } }
       if (options?.signal?.aborted) { disposeArtifact(executorArtifact); return { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } } }
       let captured: unknown
       try { captured = await executorArtifact.read(undefined, options?.signal) } catch { disposeArtifact(executorArtifact); return options?.signal?.aborted ? { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } } : { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Output artifact capture failed.' } } }
       if (!captured || typeof captured !== 'object' || typeof (captured as any).ok !== 'boolean') { disposeArtifact(executorArtifact); return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Output capture returned a malformed result.' } } }
       if (!(captured as any).ok) { const error = (captured as any).error; disposeArtifact(executorArtifact); return error && typeof error.code === 'string' && typeof error.message === 'string' ? captured as BoundaryResult<never> : { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Output capture returned a malformed failure.' } } }
       if (!((captured as any).value instanceof Uint8Array)) { disposeArtifact(executorArtifact); return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Output capture must return owned Uint8Array bytes.' } } }
       if ((captured as any).value.byteLength > 32 * 1024 * 1024) { disposeArtifact(executorArtifact); return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'Output artifact exceeds the bounded output limit.' } } }
       const executionArtifact = createMemoryArtifact((captured as any).value.slice(), execution.value.output.filename, executorArtifact.mediaType)
       disposeArtifact(executorArtifact)
      let replacement: OutputArtifact | undefined
      const disposed = new Set<OutputArtifact>()
      const disposeOnce = (artifact: OutputArtifact | undefined) => { if (artifact && !disposed.has(artifact)) { disposed.add(artifact); disposeArtifact(artifact) } }
      try {
        const verifier = await registry.resolveVerifiedVerifier(request.input, adapter.value.id, adapter.value.verifierCompatibilityKey, options?.signal)
        if (options?.signal?.aborted) { disposeOnce(executionArtifact); return { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } } }
         if (!verifier.ok || !verifier.value.verifyOutput) { disposeOnce(executionArtifact); return { ok: false, error: { code: 'UNSUPPORTED', message: 'No independent verification adapter is available for this output.' } } }
        let verified: BoundaryResult<VerificationResult>
        try { verified = await verifier.value.verifyOutput(request.input, executionArtifact, request.plan, request.approval, options?.signal) } catch (error) { disposeOnce(executionArtifact); disposeObserved(error); return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Independent verification could not be completed.' } } }
        if (!verified.ok) { disposeOnce(executionArtifact); for (const artifact of observedArtifacts(verified)) disposeOnce(artifact); return verified }
        if (verified.value.output && verified.value.output !== executionArtifact) { disposeOnce(executionArtifact); disposeOnce(verified.value.output); return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Verifier returned a replacement artifact.' } } }
        replacement = verified.value.output
        if (options?.signal?.aborted) { disposeOnce(executionArtifact); disposeOnce(replacement); return { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } } }
        // The expected check set comes from the verifier's canonical contract declaration — never
        // from the verification result under validation.
        const declaredCheckIds = canonicalVerificationCheckIds(verifier.value)
        const verificationPassed = declaredCheckIds ? await validVerification(request, verified.value, executionArtifact, declaredCheckIds, verifier.value.capability.mimeTypes[0]) : false
        if (!declaredCheckIds || !verificationPassed) { disposeOnce(executionArtifact); disposeOnce(replacement); return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Independent verification did not pass.' } } }
        return { ok: true, value: { ...execution.value, identity: verified.value.identity, verification: verified.value, verificationCheckIds: [...declaredCheckIds], outputVerification: 'passed', output: { ...execution.value.output, artifact: executionArtifact }, removedTargetIds: verified.value.removedTargetIds, preservedTargetIds: verified.value.preservedTargetIds, warnings: verified.value.warnings } }
      } catch { disposeOnce(executionArtifact); disposeOnce(replacement); return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Local processing could not be completed.' } } }
    },
    async verify(_input): Promise<BoundaryResult<VerificationResult>> { return { ok: false, error: { code: 'UNSUPPORTED', message: 'Use removal execution for independent output verification.' } } }
  }
}
