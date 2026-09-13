import type { FileIdentity } from './file'
import type { LocalInputDescriptor } from './input'
import type { OutputArtifact } from './artifact'

export type VerificationCheck = Readonly<{
  id: string
  name: string
  status: 'not-run' | 'passed' | 'failed'
}>

export type VerificationResult = Readonly<{
  kind: 'verification'
  status: 'success' | 'partial' | 'failed' | 'unsupported'
  input: LocalInputDescriptor
  outputCreated: boolean
  output?: OutputArtifact
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
