import type { LocalInput } from './input'
import type { InspectionResult } from './metadata'
import type { EditRequest, ProcessingRequest, ProcessingResult, RemovalPlan, RemovalRequest } from './operation'
import type { BoundaryResult, VerificationResult } from './result'

export type BoundaryOptions = Readonly<{ signal?: AbortSignal }>

export interface LocalProcessingBoundary {
  inspect(input: LocalInput, options?: BoundaryOptions): Promise<BoundaryResult<InspectionResult>>
  planRemoval(request: RemovalRequest, options?: BoundaryOptions): Promise<BoundaryResult<RemovalPlan>>
  execute(request: ProcessingRequest | EditRequest, options?: BoundaryOptions): Promise<BoundaryResult<ProcessingResult>>
  verify(input: LocalInput, options?: BoundaryOptions): Promise<BoundaryResult<VerificationResult>>
}
