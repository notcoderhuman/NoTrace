import type { FileIdentity } from './file'
import type { LocalInputDescriptor } from './input'
import type { OutputArtifact } from './artifact'
import type { RemovalTraceEntry } from './operation'
import type { ProcessingIdentity } from './identity'

export const JPEG_VERIFICATION_CHECK_IDS = Object.freeze(['output-soi', 'output-eoi', 'segment-structure', 'output-size', 'segment-count', 'approved-com-absent', 'preserved-targets-present', 'image-bytes-preserved', 'retained-segments-preserved', 'retained-order-preserved', 'no-unexpected-changes', 'original-unchanged', 'distinct-artifact'] as const)

export type VerificationCheck = Readonly<{
  id: string
  name: string
  status: 'not-run' | 'passed' | 'failed'
}>

export type VerificationResult = Readonly<{
  kind: 'verification'
  /** Generic boundary fields; format-specific checks remain in the adapter. */
  identity: ProcessingIdentity
  status: 'success' | 'partial' | 'failed' | 'unsupported'
  input: LocalInputDescriptor
  outputCreated: boolean
  output?: OutputArtifact
  sourceFingerprint: string
  planId: string
  inputId: string
  approvedTargetIds: readonly string[]
  removalTrace: readonly RemovalTraceEntry[]
  checks: readonly VerificationCheck[]
  removedTargetIds: readonly string[]
  preservedTargetIds: readonly string[]
  warnings: readonly string[]
}>

export type Report = Readonly<{
  kind: 'report'
  status: 'success' | 'partial' | 'unsupported' | 'failed'
  input: FileIdentity
  changes: readonly Readonly<{ fieldId: string; action: 'removed' | 'edited' | 'preserved' }>[]
  warnings: readonly string[]
}>

export type BoundaryErrorCode = 'INVALID_INPUT' | 'UNSUPPORTED' | 'LIMIT_EXCEEDED' | 'CANCELLED' | 'PROCESSING_FAILED' | 'VERIFICATION_FAILED'

export type BoundaryError = Readonly<{
  code: BoundaryErrorCode
  message: string
  field?: string
}>

export type BoundaryResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: BoundaryError }>
