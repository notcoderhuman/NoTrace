import type { LocalInput, LocalInputDescriptor } from './input'
import type { InspectionResult } from './metadata'
import type { OutputArtifact } from './artifact'
import type { ProcessingIdentity } from './identity'
import type { ProcessingResult, RemovalApproval, RemovalPlan } from './operation'
import type { BoundaryErrorCode, BoundaryResult, VerificationResult } from './result'

/** Operations a format may actually expose. This is descriptive, not a feature promise. */
export type FormatOperation = 'inspect' | 'planRemoval' | 'executeRemoval' | 'verifyRemoval' | 'edit' | 'provenanceRead' | 'provenanceWrite' | 'watermarkAnalysis' | 'watermarkRemoval'

export type StaticCapabilityDeclaration = Readonly<{
  formatId: string
  operations: readonly FormatOperation[]
  extensions: readonly string[]
  mimeTypes: readonly string[]
  /** NoTrace-owned identity for the implementation and its verifier compatibility. */
  processingIdentity?: ProcessingIdentity
  verifierCompatibilityKey?: string
  /**
   * NoTrace-owned canonical identities of the verification checks this format declares.
   * This is the authoritative source of the *expected* check set. A VerificationResult
   * reports checks; it never defines what checks were expected.
   */
  verificationCheckIds?: readonly string[]
}>

export type EvidenceValueState = 'detected' | 'not-detected' | 'unknown' | 'unsupported' | 'protected'
export type EvidenceSafety = 'safe-to-remove' | 'editable' | 'protected' | 'unknown' | 'unsupported'

/** Format-neutral evidence. Parser-specific structures stay behind the adapter boundary. */
export type EvidenceRecord = Readonly<{
  id: string
  label: string
  category: string
  state: EvidenceValueState
  safety: EvidenceSafety
  explanation: string
  source: 'local-inspection' | 'simulated-fixture' | 'boundary-result'
  targetId?: string
  location?: Readonly<{ kind: 'range' | 'field' | 'container'; start?: number; end?: number; path?: string }>
  confidence: 'high' | 'medium' | 'low' | 'unknown'
}>

export type ResourceMeasurementState = 'measured' | 'inferred' | 'unmeasured'
export type ResourceContract = Readonly<{
  inputBound: Readonly<{ maxBytes: number; state: ResourceMeasurementState }>
  fullBufferOperations: Readonly<{ expected?: number; state: ResourceMeasurementState }>
  streaming: Readonly<{ supported: boolean; state: ResourceMeasurementState }>
  worker: Readonly<{ required: boolean; state: ResourceMeasurementState }>
  transfer: Readonly<{ transferable: boolean; copies: boolean; state: ResourceMeasurementState }>
  temporaryAllocations: ResourceMeasurementState
  concurrency: Readonly<{ max?: number; state: ResourceMeasurementState }>
  cancellationPoints: readonly string[]
}>

export type AdapterConformanceLevel = 'inspect-only' | 'removal-capable' | 'verification-capable'
export type AdapterConformance = Readonly<{
  level: AdapterConformanceLevel
  declaration: StaticCapabilityDeclaration
  resource: ResourceContract
  independentVerifier?: true
}>

export type ContractOperationContext = Readonly<{
  input: LocalInput
  descriptor: LocalInputDescriptor
  signal?: AbortSignal
  identity?: ProcessingIdentity
}>

export type ContractBoundPlan = Readonly<{
  plan: RemovalPlan
  source: LocalInputDescriptor
  sourceFingerprint: string
  formatId: string
  approvedTargetIds: readonly string[]
  witnesses: RemovalPlan['removalWitnesses']
  preservation: Readonly<{ preservedTargetIds: readonly string[] }>
}>

export type ContractExecutionOutcome = Readonly<{
  processing: BoundaryResult<ProcessingResult>
  verified: false
}> | Readonly<{
  processing: BoundaryResult<ProcessingResult>
  verified: true
  verification: BoundaryResult<VerificationResult>
  artifact: OutputArtifact
}> 

export type ContractErrorCode = BoundaryErrorCode | 'STALE_OPERATION' | 'OWNERSHIP_ERROR' | 'CAPABILITY_UNAVAILABLE'

export function isStaticCapabilityDeclaration(value: unknown): value is StaticCapabilityDeclaration {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StaticCapabilityDeclaration>
  const strings = (items: unknown): items is readonly string[] => Array.isArray(items) && items.length > 0 && items.every(item => typeof item === 'string' && item.trim().length > 0) && new Set(items).size === items.length
  return typeof candidate.formatId === 'string' && candidate.formatId.trim().length > 0
    && Array.isArray(candidate.operations) && candidate.operations.length > 0 && new Set(candidate.operations).size === candidate.operations.length
    && strings(candidate.extensions) && strings(candidate.mimeTypes)
    && (candidate.verificationCheckIds === undefined || strings(candidate.verificationCheckIds))
}

const evidenceKeys = new Set(['id', 'label', 'category', 'state', 'safety', 'explanation', 'source', 'targetId', 'location', 'confidence'])

export function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<EvidenceRecord>
  const keys = Object.keys(value)
  if (keys.some(key => !evidenceKeys.has(key))) return false
  if (typeof candidate.id !== 'string' || candidate.id.length === 0 || typeof candidate.label !== 'string' || candidate.label.length === 0 || typeof candidate.category !== 'string' || typeof candidate.explanation !== 'string') return false
  if (!['detected', 'not-detected', 'unknown', 'unsupported', 'protected'].includes(candidate.state ?? '') || !['safe-to-remove', 'editable', 'protected', 'unknown', 'unsupported'].includes(candidate.safety ?? '') || !['local-inspection', 'simulated-fixture', 'boundary-result'].includes(candidate.source ?? '') || !['high', 'medium', 'low', 'unknown'].includes(candidate.confidence ?? '')) return false
  if (candidate.state === 'not-detected' && candidate.safety === 'safe-to-remove') return false
  if (candidate.state === 'unknown' && (candidate.safety === 'safe-to-remove' || candidate.targetId !== undefined)) return false
  if (candidate.safety === 'safe-to-remove' && (typeof candidate.targetId !== 'string' || candidate.targetId.length === 0)) return false
  return true
}

/** A single shared adapter conformance shape for future format implementations. */
export type AdapterContract = Readonly<{
  conformance: AdapterConformance
  evidence?: (result: InspectionResult) => readonly EvidenceRecord[]
  inspect?: (context: ContractOperationContext) => Promise<BoundaryResult<InspectionResult>>
  planRemoval?: (context: ContractOperationContext, targetIds: readonly string[]) => Promise<BoundaryResult<RemovalPlan>>
  executeRemoval?: (context: ContractOperationContext, plan: RemovalPlan, approval: RemovalApproval) => Promise<BoundaryResult<ProcessingResult>>
  verifyRemoval?: (context: ContractOperationContext, output: OutputArtifact, plan: RemovalPlan, approval: RemovalApproval) => Promise<BoundaryResult<VerificationResult>>
}>
