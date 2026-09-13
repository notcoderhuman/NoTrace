import type { FormatAdapterRegistry } from '../processing-core/adapters/registry'
import type { LocalProcessingBoundary } from '../processing-core/domain/boundary'
import type { LocalInput } from '../processing-core/domain/input'
import type { InspectionResult } from '../processing-core/domain/metadata'
import type { EditRequest, ProcessingRequest, ProcessingResult, RemovalPlan, RemovalRequest } from '../processing-core/domain/operation'
import type { BoundaryResult, VerificationResult } from '../processing-core/domain/result'

const unsupported = (message: string): BoundaryResult<never> => ({ ok: false, error: { code: 'UNSUPPORTED', message } })

function inputSummary(input: LocalInput) {
  const { filename, mimeType, size } = input.descriptor
  return { filename, mimeType, size }
}

export function createNoopBoundary(_registry?: FormatAdapterRegistry): LocalProcessingBoundary {
  return {
    async inspect(input): Promise<BoundaryResult<InspectionResult>> {
      if (!input.descriptor.filename.trim()) return { ok: false, error: { code: 'INVALID_INPUT', message: 'A filename is required.' } }
      return { ok: true, value: { kind: 'inspection', status: 'unsupported', input: inputSummary(input), format: { mimeType: input.descriptor.mimeType, state: 'unknown' }, fields: [], warnings: ['Phase 1 does not read or inspect file bytes.'], analyzed: false } }
    },
    async planRemoval(_request: RemovalRequest): Promise<BoundaryResult<RemovalPlan>> {
      return { ok: true, value: { status: 'unsupported', removableFieldIds: [], preservedFieldIds: [], warnings: ['No metadata has been inspected; uncertain fields are preserved.'] } }
    },
    async execute(_request: ProcessingRequest | EditRequest): Promise<BoundaryResult<ProcessingResult>> {
      return unsupported('Phase 1 does not modify or create media files.')
    },
    async verify(_input: LocalInput): Promise<BoundaryResult<VerificationResult>> {
      return { ok: true, value: { kind: 'verification', status: 'unsupported', input: _input.descriptor, outputCreated: false, checks: [], warnings: ['Phase 1 does not create output artifacts to verify.'] } }
    },
  }
}
