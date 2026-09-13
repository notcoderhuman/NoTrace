import type { FormatAdapterRegistry } from '../processing-core/adapters/registry'
import type { LocalProcessingBoundary, BoundaryOptions } from '../processing-core/domain/boundary'
import type { LocalInput } from '../processing-core/domain/input'
import type { InspectionResult } from '../processing-core/domain/metadata'
import type { EditRequest, ProcessingRequest, ProcessingResult, RemovalPlan, RemovalRequest } from '../processing-core/domain/operation'
import type { BoundaryResult, VerificationResult } from '../processing-core/domain/result'

function validInput(input: LocalInput): BoundaryResult<void> {
  if (!input.descriptor.id.trim() || !input.descriptor.filename.trim()) return { ok: false, error: { code: 'INVALID_INPUT', message: 'A local input identity and filename are required.' } }
  return { ok: true, value: undefined }
}

export function createPlanningBoundary(registry: FormatAdapterRegistry): LocalProcessingBoundary {
  return {
    async inspect(input, options): Promise<BoundaryResult<InspectionResult>> {
      const valid = validInput(input)
      if (!valid.ok) return valid
      if (options?.signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Inspection was cancelled.' } }
      const resolved = registry.resolveInspection(input.descriptor)
      if (!resolved.ok || !resolved.value.inspect) return { ok: false, error: { code: 'UNSUPPORTED', message: 'No inspection adapter is available for this input.' } }
      return resolved.value.inspect(input)
    },
    async planRemoval(request: RemovalRequest, options?: BoundaryOptions): Promise<BoundaryResult<RemovalPlan>> {
      const valid = validInput(request.input)
      if (!valid.ok) return valid
      if (options?.signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Removal planning was cancelled.' } }
      const resolved = registry.resolveRemovalPlan(request.input.descriptor)
      if (!resolved.ok || !resolved.value.planRemoval) return { ok: false, error: { code: 'UNSUPPORTED', message: 'No removal planning adapter is available for this input.' } }
      return resolved.value.planRemoval(request.input, request.fieldIds, request.policy, options?.signal)
    },
    async execute(_request: ProcessingRequest | EditRequest): Promise<BoundaryResult<ProcessingResult>> {
      return { ok: false, error: { code: 'UNSUPPORTED', message: 'Removal execution is not available in plan-only mode.' } }
    },
    async verify(_input: LocalInput): Promise<BoundaryResult<VerificationResult>> {
      return { ok: false, error: { code: 'UNSUPPORTED', message: 'Verification is not available in plan-only mode.' } }
    },
  }
}
