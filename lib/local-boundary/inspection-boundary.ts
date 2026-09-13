import type { FormatAdapterRegistry } from '../processing-core/adapters/registry'
import type { LocalProcessingBoundary, BoundaryOptions } from '../processing-core/domain/boundary'
import type { LocalInput } from '../processing-core/domain/input'
import type { InspectionResult } from '../processing-core/domain/metadata'
import type { EditRequest, ProcessingRequest, ProcessingResult, RemovalPlan, RemovalRequest } from '../processing-core/domain/operation'
import type { BoundaryResult, VerificationResult } from '../processing-core/domain/result'

function validateInput(input: LocalInput): BoundaryResult<void> {
  if (!input.descriptor.id.trim() || !input.descriptor.filename.trim()) return { ok: false, error: { code: 'INVALID_INPUT', message: 'A local input identity and filename are required.' } }
  if (input.descriptor.size !== undefined && (!Number.isSafeInteger(input.descriptor.size) || input.descriptor.size < 0)) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Local input size is invalid.' } }
  return { ok: true, value: undefined }
}

export function createInspectionBoundary(registry: FormatAdapterRegistry): LocalProcessingBoundary {
  return {
    async inspect(input, options?: BoundaryOptions): Promise<BoundaryResult<InspectionResult>> {
      const valid = validateInput(input)
      if (!valid.ok) return valid
      if (options?.signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Inspection was cancelled.' } }
      const resolved = registry.resolveInspection(input.descriptor)
      if (!resolved.ok) return resolved
      if (!resolved.value.inspect) return { ok: false, error: { code: 'UNSUPPORTED', message: 'The selected adapter cannot inspect this input.' } }
      return resolved.value.inspect(input)
    },
    async planRemoval(_request: RemovalRequest): Promise<BoundaryResult<RemovalPlan>> {
      return { ok: false, error: { code: 'UNSUPPORTED', message: 'Removal is not available in inspection-only mode.' } }
    },
    async execute(_request: ProcessingRequest | EditRequest): Promise<BoundaryResult<ProcessingResult>> {
      return { ok: false, error: { code: 'UNSUPPORTED', message: 'Execution is not available in inspection-only mode.' } }
    },
    async verify(_input: LocalInput): Promise<BoundaryResult<VerificationResult>> {
      return { ok: false, error: { code: 'UNSUPPORTED', message: 'Verification is not available in inspection-only mode.' } }
    },
  }
}
