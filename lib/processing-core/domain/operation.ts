import type { LocalInput, LocalInputDescriptor } from './input'
import type { SafetyClassification } from './metadata'
import type { OutputArtifact } from './artifact'

export type Operation = 'inspect' | 'remove' | 'edit' | 'verify'

export type RemovalRequest = Readonly<{
  input: LocalInput
  fieldIds: readonly string[]
  policy: string
}>

export type RemovalTargetCategory = 'comment' | 'xmp' | 'exif' | 'icc' | 'unknown'

export type RemovalTarget = Readonly<{
  id: string
  kind: 'jpeg-segment'
  marker: number
  ordinal: number
  startOffset: number
  endOffset: number
  category: RemovalTargetCategory
  classification: SafetyClassification
  removable: boolean
  reason: string
}>

export type RemovalWitness = Readonly<{
  sourceFingerprint: string
  targetId: string
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
  removalTrace?: readonly RemovalTraceEntry[]
  removedTargetIds: readonly string[]
  preservedTargetIds: readonly string[]
  warnings: readonly string[]
  report?: import('./result').Report
}>
