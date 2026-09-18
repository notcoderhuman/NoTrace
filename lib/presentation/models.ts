export type PresentationSource = 'demo' | 'real'

export type UnifiedOperationState =
  | 'idle'
  | 'admitted'
  | 'probing'
  | 'inspecting'
  | 'inspected'
  | 'planning'
  | 'ready'
  | 'ready-empty'
  | 'awaiting-approval'
  | 'processing'
  | 'verifying'
  | 'verified'
  | 'provider-owned'
  | 'downloading'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'stale'
  | 'unknown'
  | 'unsupported'

export type FormatState = 'known' | 'unknown' | 'unsupported' | 'probing'
export type CapabilityState = 'available' | 'unavailable' | 'unknown'
export type PreviewState = 'available' | 'loading' | 'unavailable' | 'not-applicable'

export type UnifiedFileViewModel = Readonly<{
  id: string
  filename: string
  format: Readonly<{ id?: string; label: string; state: FormatState }>
  size?: Readonly<{ bytes: number; label: string }>
  source: PresentationSource
  originalPreserved: boolean
  preview: Readonly<{ state: PreviewState; url?: string }>
  capability: Readonly<{ inspect: CapabilityState; remove: CapabilityState; verify: CapabilityState }>
  operationState: UnifiedOperationState
}>

export type MetadataValueState = 'present' | 'absent' | 'unknown' | 'unsupported'
export type MetadataClassification = 'safe' | 'removable' | 'protected' | 'unknown' | 'unsupported'
export type PrivacyRelevance = 'high' | 'medium' | 'low' | 'unknown'
export type MetadataEvidenceSource = 'demo-fixture' | 'jpeg-structure' | 'boundary-result'

export type UnifiedMetadataViewModel = Readonly<{
  id: string
  category: string
  field: string
  value: string
  valueState: MetadataValueState
  classification: MetadataClassification
  privacyRelevance: PrivacyRelevance
  removable: boolean
  evidence: Readonly<{ source: MetadataEvidenceSource; targetId?: string }>
}>

export type PrivacyFindingStatus = 'DETECTED' | 'NOT_DETECTED' | 'UNKNOWN' | 'UNSUPPORTED' | 'PROTECTED' | 'REMOVABLE'
export type PrivacyFindingViewModel = Readonly<{
  id: string
  label: string
  category: string
  status: PrivacyFindingStatus
  explanation: string
  evidence?: string
  targetId?: string
  source: PresentationSource
}>

export type RiskAssessmentViewModel = Readonly<{
  state: 'AVAILABLE' | 'NOT_AVAILABLE' | 'PARTIAL'
  score?: number
  level?: string
  reasons: readonly string[]
  contributingFindingIds: readonly string[]
  confidence: 'high' | 'medium' | 'low' | 'unknown'
  methodology: Readonly<{ id: string; version: string }>
  source: PresentationSource
}>

export type ProgressViewModel = Readonly<{
  state: Exclude<UnifiedOperationState, 'admitted' | 'probing' | 'inspected' | 'ready' | 'ready-empty' | 'verified' | 'provider-owned' | 'unknown' | 'unsupported'>
  mode: 'determinate' | 'indeterminate'
  percentage?: number
  label: string
  detail?: string
}>

export type RemovalTargetViewModel = Readonly<{
  id: string
  label: string
  category: string
  capability: 'removable' | 'preserved' | 'protected' | 'unsupported' | 'unknown'
  selectable: boolean
  reason: string
}>

export type RemovalViewModel = Readonly<{
  state: 'unavailable' | 'planning' | 'ready-with-targets' | 'ready-empty' | 'unsupported' | 'unknown' | 'awaiting-approval' | 'processing' | 'verifying' | 'verified' | 'failed' | 'cancelled' | 'stale'
  targets: readonly RemovalTargetViewModel[]
  selectedTargetIds: readonly string[]
  requestedTargetIds: readonly string[]
  removedTargetIds: readonly string[]
  preservedTargetIds: readonly string[]
  limitations: readonly string[]
  output?: Readonly<{ filename: string; size?: number; ownership: 'execution' | 'verified' | 'provider' | 'disposed'; downloadable: boolean }>
}>

export type VerificationViewModel = Readonly<{
  state: 'not-run' | 'running' | 'passed' | 'failed' | 'cancelled'
  checks: readonly Readonly<{ id: string; label: string; state: 'passed' | 'failed' | 'not-run' | 'unknown' }>[]
  sourceBinding: 'matched' | 'mismatched' | 'unknown'
  identityBinding: 'matched' | 'mismatched' | 'unknown'
  preservedItems: readonly string[]
  removedItems: readonly string[]
  warnings: readonly string[]
  provenance: PresentationSource
}>

export type ReportViewModel = Readonly<{
  id: string
  provenance: PresentationSource
  source: Readonly<{ filename: string; format?: string; size?: number }>
  findingsBefore: readonly PrivacyFindingViewModel[]
  requestedActions: readonly string[]
  actionsPerformed: readonly string[]
  verification: VerificationViewModel
  preservedItems: readonly string[]
  removedItems: readonly string[]
  output?: Readonly<{ filename: string; size?: number; downloadable: boolean }>
  limitations: readonly string[]
  sessionOnly: boolean
}>

export function deriveReportCounts(report: ReportViewModel): Readonly<{ found: number; requested: number; performed: number; preserved: number; removed: number }> {
  return { found: report.findingsBefore.length, requested: report.requestedActions.length, performed: report.actionsPerformed.length, preserved: report.preservedItems.length, removed: report.removedItems.length }
}
