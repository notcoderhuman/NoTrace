import type { LocalInput, LocalInputDescriptor } from './input'
import type { SafetyClassification } from './metadata'
import type { OutputArtifact } from './artifact'
import type { ProcessingIdentity } from './identity'

export type Operation = 'inspect' | 'remove' | 'edit' | 'verify'

export type RemovalRequest = Readonly<{
  input: LocalInput
  fieldIds: readonly string[]
  policy: string
}>

export type RemovalTargetCategory = 'comment' | 'xmp' | 'exif' | 'icc' | 'unknown'

export type RemovalTarget = Readonly<{
  id: string
  formatId?: string
  kind: 'jpeg-segment' | 'format-target'
  typeId?: string
  marker: number
  ordinal: number
  startOffset: number
  endOffset: number
  category: RemovalTargetCategory
  /** NoTrace policy identity; arbitrary adapter strings are not authoritative. */
  scope?: Readonly<{ formatId: string; scopeId: string }>
  classification: SafetyClassification
  removable: boolean
  reason: string
}>

export type TargetIdentity = Readonly<{
  formatId: string
  typeId: string
  ordinal: number
  startOffset: number
  endOffset: number
}>

export type RemovalWitness = Readonly<{
  sourceFingerprint: string
  targetId: string
  identity: TargetIdentity
  ordinal: number
  startOffset: number
  endOffset: number
  marker: number
  rangeLength: number
}>

export type RemovalTraceEntry = RemovalWitness

export type RemovalPlan = Readonly<{
  id: string
  status: 'ready' | 'unsupported' | 'unknown'
  /** NoTrace-owned identity binding required for executable plans. */
  identity: ProcessingIdentity
  input: LocalInputDescriptor
  sourceFingerprint: string
  targets: readonly RemovalTarget[]
  removableTargetIds: readonly string[]
  preservedTargetIds: readonly string[]
  warnings: readonly string[]
  requiresApproval: true
  removableFieldIds: readonly string[]
  preservedFieldIds: readonly string[]
  removalWitnesses: readonly RemovalWitness[]
}>

export type RemovalApproval = Readonly<{
  planId: string
  inputId: string
  sourceFingerprint: string
  identity: ProcessingIdentity
  approvedTargetIds: readonly string[]
  approvedAt: number
}>

export type EditRequest = Readonly<{
  input: LocalInput
  changes: Readonly<Record<string, string>>
}>

export type ProcessingRequest = Readonly<{
  operation: 'remove' | 'edit'
  input: LocalInput
  removal?: RemovalRequest
  edit?: EditRequest
  plan?: RemovalPlan
  approval?: RemovalApproval
}>

export type ProcessingStatus = 'success' | 'partial' | 'unsupported' | 'failed'

export type ProcessingResult = Readonly<{
  kind: 'processing'
  status: ProcessingStatus
  input: Readonly<{ filename: string; mimeType?: string; size?: number }>
  output?: Readonly<{ filename: string; created: true; artifact: OutputArtifact }>
  outputVerification: 'not-run' | 'passed'
  /** Authoritative verifier result propagated for presentation projection only. */
  verification?: import('./result').VerificationResult
  /**
   * NoTrace-owned canonical check identities the verifier was required to report, stamped by the
   * boundary from the verifier's canonical contract declaration. Presentation and settlement read
   * expectations from here — never from `verification.checks`.
   */
  verificationCheckIds?: readonly string[]
  identity?: ProcessingIdentity
  removalTrace?: readonly RemovalTraceEntry[]
  removedTargetIds: readonly string[]
  preservedTargetIds: readonly string[]
  warnings: readonly string[]
  report?: import('./result').Report
}>
