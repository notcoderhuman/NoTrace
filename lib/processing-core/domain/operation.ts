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
  category: RemovalTargetCategory
  classification: SafetyClassification
  removable: boolean
  reason: string
}>

export type RemovalPlan = Readonly<{
  id: string
  status: 'ready' | 'unsupported' | 'unknown'
  input: LocalInputDescriptor
  targets: readonly RemovalTarget[]
  removableTargetIds: readonly string[]
  preservedTargetIds: readonly string[]
  warnings: readonly string[]
  requiresApproval: true
  removableFieldIds: readonly string[]
  preservedFieldIds: readonly string[]
}>

export type RemovalApproval = Readonly<{
  planId: string
  inputId: string
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
  removedTargetIds: readonly string[]
  preservedTargetIds: readonly string[]
  warnings: readonly string[]
  report?: import('./result').Report
}>
