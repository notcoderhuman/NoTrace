import type { FormatAdapterRegistry } from '../processing-core/adapters/registry'
import type { LocalProcessingBoundary, BoundaryOptions } from '../processing-core/domain/boundary'
import type { LocalInput } from '../processing-core/domain/input'
import type { InspectionResult } from '../processing-core/domain/metadata'
import type { EditRequest, ProcessingRequest, ProcessingResult, RemovalPlan, RemovalRequest } from '../processing-core/domain/operation'
import { JPEG_VERIFICATION_CHECK_IDS, type BoundaryResult, type VerificationResult } from '../processing-core/domain/result'

function validate(input: LocalInput): BoundaryResult<void> {
  if (!input.descriptor.id.trim() || !input.descriptor.filename.trim()) return { ok: false, error: { code: 'INVALID_INPUT', message: 'A local input identity and filename are required.' } }
  return { ok: true, value: undefined }
}

export function createProcessingBoundary(registry: FormatAdapterRegistry): LocalProcessingBoundary {
  return {
    async inspect(input, options): Promise<BoundaryResult<InspectionResult>> {
      const valid = validate(input); if (!valid.ok) return valid
      if (options?.signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Inspection was cancelled.' } }
      const adapter = registry.resolveInspection(input.descriptor)
      if (!adapter.ok || !adapter.value.inspect) return { ok: false, error: { code: 'UNSUPPORTED', message: 'No inspection adapter is available for this input.' } }
      return adapter.value.inspect(input, options?.signal)
    },
    async planRemoval(request, options): Promise<BoundaryResult<RemovalPlan>> {
      const valid = validate(request.input); if (!valid.ok) return valid
      if (options?.signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Removal planning was cancelled.' } }
      const adapter = registry.resolveRemovalPlan(request.input.descriptor)
      if (!adapter.ok || !adapter.value.planRemoval) return { ok: false, error: { code: 'UNSUPPORTED', message: 'No removal planning adapter is available for this input.' } }
      return adapter.value.planRemoval(request.input, request.fieldIds, request.policy, options?.signal)
    },
    async execute(request, options): Promise<BoundaryResult<ProcessingResult>> {
      const valid = validate(request.input); if (!valid.ok) return valid
      if (!('operation' in request) || request.operation !== 'remove' || !request.plan || !request.approval) return { ok: false, error: { code: 'INVALID_INPUT', message: 'An approved removal plan is required.' } }
      if (options?.signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } }
      const adapter = registry.resolveRemoval(request.input.descriptor)
      if (!adapter.ok || !adapter.value.remove) return { ok: false, error: { code: 'UNSUPPORTED', message: 'No removal execution adapter is available for this input.' } }
      let execution: BoundaryResult<ProcessingResult>
      try { execution = await adapter.value.remove(request.input, request.plan, request.approval, options?.signal) } catch { return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Local processing could not be completed.' } } }
      if (!execution.ok || !execution.value.output) return execution
      const executionArtifact = execution.value.output.artifact
      try {
        const verifier = registry.resolveVerifier(request.input.descriptor, adapter.value.id)
        if (!verifier.ok || !verifier.value.verifyOutput) { executionArtifact.dispose(); return { ok: false, error: { code: 'UNSUPPORTED', message: 'No independent verification adapter is available for this output.' } } }
        const verified = await verifier.value.verifyOutput(request.input, executionArtifact, request.plan, request.approval, options?.signal)
        if (!verified.ok || !verified.value.output || verified.value.status !== 'success' || verified.value.outputCreated !== true || verified.value.output !== executionArtifact || typeof verified.value.output.dispose !== 'function' || typeof verified.value.output.read !== 'function' || !Number.isSafeInteger(verified.value.output.size) || verified.value.checks.length !== JPEG_VERIFICATION_CHECK_IDS.length || new Set(verified.value.checks.map(check => check.id)).size !== verified.value.checks.length || verified.value.checks.some(check => check.status !== 'passed' || !check.id.trim() || !check.name.trim() || !JPEG_VERIFICATION_CHECK_IDS.includes(check.id as typeof JPEG_VERIFICATION_CHECK_IDS[number])) || JPEG_VERIFICATION_CHECK_IDS.some(id => !verified.value.checks.some(check => check.id === id)) || verified.value.sourceFingerprint !== request.plan.sourceFingerprint || verified.value.planId !== request.plan.id || verified.value.inputId !== request.input.descriptor.id || verified.value.approvedTargetIds.length !== request.approval.approvedTargetIds.length || verified.value.approvedTargetIds.some((id, index) => id !== request.approval!.approvedTargetIds[index]) || verified.value.removalTrace.length !== request.approval.approvedTargetIds.length || verified.value.removalTrace.some((trace, index) => { const witness = request.plan!.removalWitnesses.find(candidate => candidate.targetId === request.approval!.approvedTargetIds[index]); return !witness || trace.sourceFingerprint !== witness.sourceFingerprint || trace.targetId !== witness.targetId || trace.ordinal !== witness.ordinal || trace.startOffset !== witness.startOffset || trace.endOffset !== witness.endOffset || trace.marker !== witness.marker || trace.rangeLength !== witness.rangeLength }) || verified.value.removedTargetIds.length !== request.approval.approvedTargetIds.length || verified.value.removedTargetIds.some((id, index) => id !== request.approval!.approvedTargetIds[index]) || verified.value.preservedTargetIds.some((id, index) => id !== request.plan!.preservedTargetIds[index]) || verified.value.preservedTargetIds.length !== request.plan.preservedTargetIds.length) { executionArtifact.dispose(); if (verified.ok && verified.value.output && verified.value.output !== executionArtifact) verified.value.output.dispose(); return verified.ok ? { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Verification returned an invalid success contract.' } } : verified }
        if (options?.signal?.aborted) { executionArtifact.dispose(); if (verified.value.output !== executionArtifact) verified.value.output.dispose(); return { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } } }
        if (verified.value.output !== executionArtifact) executionArtifact.dispose()
        return { ok: true, value: { ...execution.value, outputVerification: 'passed', output: { ...execution.value.output, artifact: verified.value.output }, removedTargetIds: verified.value.removedTargetIds, preservedTargetIds: verified.value.preservedTargetIds, warnings: verified.value.warnings } }
      } catch {
        executionArtifact.dispose()
        return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Local processing could not be completed.' } }
      }
    },
    async verify(_input): Promise<BoundaryResult<VerificationResult>> {
      return { ok: false, error: { code: 'UNSUPPORTED', message: 'Use removal execution for independent output verification.' } }
    },
  }
}
