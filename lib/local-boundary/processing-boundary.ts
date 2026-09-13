import type { FormatAdapterRegistry } from '../processing-core/adapters/registry'
import type { LocalProcessingBoundary, BoundaryOptions } from '../processing-core/domain/boundary'
import type { LocalInput } from '../processing-core/domain/input'
import type { InspectionResult } from '../processing-core/domain/metadata'
import type { EditRequest, ProcessingRequest, ProcessingResult, RemovalPlan, RemovalRequest } from '../processing-core/domain/operation'
import type { BoundaryResult, VerificationResult } from '../processing-core/domain/result'

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
      return adapter.value.inspect(input)
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
      const execution = await adapter.value.remove(request.input, request.plan, request.approval, options?.signal)
      if (!execution.ok || !execution.value.output) return execution
      const verifier = registry.resolveRemoval(request.input.descriptor)
      if (!verifier.ok || !verifier.value.verifyOutput) { execution.value.output.artifact.dispose(); return { ok: false, error: { code: 'UNSUPPORTED', message: 'No independent verification adapter is available for this output.' } } }
      const verified = await verifier.value.verifyOutput(request.input, execution.value.output.artifact, request.plan, request.approval, options?.signal)
      if (!verified.ok) { execution.value.output.artifact.dispose(); return verified }
      return { ok: true, value: { ...execution.value, outputVerification: 'passed', output: { ...execution.value.output, artifact: verified.value.output! }, removedTargetIds: verified.value.removedTargetIds, preservedTargetIds: verified.value.preservedTargetIds, warnings: verified.value.warnings } }
    },
    async verify(_input): Promise<BoundaryResult<VerificationResult>> {
      return { ok: false, error: { code: 'UNSUPPORTED', message: 'Use removal execution for independent output verification.' } }
    },
  }
}
