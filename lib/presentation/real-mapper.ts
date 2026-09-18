import type { InspectionResult } from '../processing-core/domain/metadata'
import type { RemovalPlan, ProcessingResult } from '../processing-core/domain/operation'
import type { VerificationResult } from '../processing-core/domain/result'
import type { ProgressViewModel, ReportViewModel, RiskAssessmentViewModel, UnifiedFileViewModel, UnifiedMetadataViewModel, PrivacyFindingViewModel, RemovalViewModel, VerificationViewModel } from './models'
import { scoreRisk, type RiskEvidence } from './risk-scoring'

const categoryLabel: Record<string, string> = { EXIF: 'EXIF', IPTC: 'IPTC', XMP: 'XMP', C2PA: 'C2PA', container: 'Container', other: 'Other' }
function metadataClass(value: string): UnifiedMetadataViewModel['classification'] { return value === 'SAFE_TO_REMOVE' || value === 'EDITABLE' ? 'removable' : value === 'PROTECTED' ? 'protected' : value === 'UNSUPPORTED' ? 'unsupported' : value === 'UNKNOWN' ? 'unknown' : 'safe' }
function capability(result: InspectionResult, operation: 'inspect' | 'remove' | 'verify'): UnifiedFileViewModel['capability'][typeof operation] { if (result.status === 'unsupported' || result.format.state === 'unsupported') return 'unavailable'; if (result.status === 'failed') return 'unknown'; return operation === 'inspect' ? 'available' : result.format.state === 'supported' ? 'available' : 'unknown' }
function riskState(field: InspectionResult['fields'][number]): RiskEvidence['state'] {
  if (field.classification === 'UNSUPPORTED') return 'UNSUPPORTED'
  return field.value === undefined ? 'UNKNOWN' : 'PRESENT'
}
function riskCategory(field: InspectionResult['fields'][number]): RiskEvidence['category'] {
  const id = field.id.toLowerCase()
  if (id === 'icc-profile') return 'ICC'
  if (id.startsWith('comment-')) return 'JPEG_COM'
  if (id === 'xmp-present' || field.category === 'XMP') return 'XMP'
  if (field.category === 'IPTC') return 'IPTC'
  if (id.includes('gps') || id.includes('location') || id.includes('latitude') || id.includes('longitude')) return 'LOCATION'
  if (id.includes('camera') || id.includes('device') || id.includes('make') || id.includes('model') || id.includes('lens') || id.includes('serial')) return 'DEVICE'
  if (id.includes('creator') || id.includes('author') || id.includes('artist')) return 'CREATOR'
  if (id.includes('timestamp') || id.includes('date') || id.includes('time')) return 'TIMESTAMP'
  if (id.includes('software') || id.includes('processing')) return 'SOFTWARE'
  return field.category === 'EXIF' || id === 'exif-present' || id === 'exif-byte-order' ? 'GENERAL_EXIF' : 'GENERAL_EXIF'
}

export function mapRealInspection(result: InspectionResult): Readonly<{ metadata: UnifiedMetadataViewModel[]; findings: PrivacyFindingViewModel[] }> {
  const metadata: UnifiedMetadataViewModel[] = result.fields.map(field => ({ id: field.id, category: categoryLabel[field.category] || field.category, field: field.label, value: field.value ?? 'Unknown', valueState: field.value === undefined ? 'unknown' : 'present', classification: metadataClass(field.classification), privacyRelevance: field.risk || 'unknown', removable: field.classification === 'SAFE_TO_REMOVE', evidence: { source: 'jpeg-structure' as const, targetId: field.classification === 'SAFE_TO_REMOVE' ? field.id : undefined } }))
  const findings: PrivacyFindingViewModel[] = result.fields.map(field => ({ id: field.id, label: field.label, category: categoryLabel[field.category] || field.category, status: field.classification === 'SAFE_TO_REMOVE' ? 'REMOVABLE' : field.classification === 'PROTECTED' ? 'PROTECTED' : field.classification === 'UNSUPPORTED' ? 'UNSUPPORTED' : field.value === undefined ? 'UNKNOWN' : 'DETECTED', explanation: field.value === undefined ? 'The current inspection did not establish a value or absence.' : 'Detected by local structural inspection.', evidence: field.value, targetId: field.classification === 'SAFE_TO_REMOVE' ? field.id : undefined, source: 'real' as const }))
  return { metadata, findings }
}

export function mapRealFile(input: Readonly<{ id: string; filename: string; mimeType?: string; size?: number }>, result?: InspectionResult): UnifiedFileViewModel {
  const status = result?.status
  const formatState = result?.format.state === 'supported' ? 'known' : result?.format.state === 'unsupported' || status === 'unsupported' ? 'unsupported' : result ? 'unknown' : 'probing'
  return { id: input.id, filename: input.filename, format: { id: result?.format.extension, label: result?.format.mimeType || input.mimeType || 'Unknown format', state: formatState }, size: typeof input.size === 'number' ? { bytes: input.size, label: `${input.size} bytes` } : undefined, source: 'real', originalPreserved: true, preview: { state: 'unavailable' }, capability: { inspect: result ? capability(result, 'inspect') : 'unknown', remove: result ? capability(result, 'remove') : 'unknown', verify: result ? capability(result, 'verify') : 'unknown' }, operationState: status === 'success' || status === 'partial' ? 'inspected' : status === 'unsupported' ? 'unsupported' : status === 'failed' ? 'failed' : 'probing' }
}

export function mapRealRisk(result?: InspectionResult): RiskAssessmentViewModel {
  if (!result || (result.status !== 'success' && result.status !== 'partial')) return scoreRisk([], 'real')
  const evidence: RiskEvidence[] = result.fields.map(field => ({ id: field.id, category: riskCategory(field), state: riskState(field) }))
  return scoreRisk(evidence, 'real')
}
export function mapRealProgress(state: ProgressViewModel['state'], detail?: string): ProgressViewModel { return { state, mode: 'indeterminate', label: state.replaceAll('-', ' '), detail } }

export type SafeProcessingProjection = Readonly<Pick<ProcessingResult, 'status' | 'outputVerification' | 'removedTargetIds' | 'preservedTargetIds' | 'warnings'> & { output?: Readonly<{ filename: string; created: true }>; verification?: VerificationResult; providerOwned?: true }>

export function mapRealRemoval(plan: RemovalPlan, selectedTargetIds: readonly string[] = [], processing?: SafeProcessingProjection): RemovalViewModel {
  const targets = plan.targets.map(target => ({ id: target.id, label: target.category, category: target.category, capability: target.removable ? 'removable' as const : target.classification === 'PROTECTED' ? 'protected' as const : target.classification === 'UNKNOWN' ? 'unknown' as const : 'preserved' as const, selectable: target.removable && plan.removableTargetIds.includes(target.id), reason: target.reason }))
  const authoritativeVerification = processing?.providerOwned === true && processing?.verification?.status === 'success' && processing.verification.outputCreated === true && processing.outputVerification === 'passed' && processing.output !== undefined
  const state = processing?.status === 'success' && processing.outputVerification === 'passed' && authoritativeVerification ? 'verified' : processing?.status === 'unsupported' ? 'unsupported' : processing ? 'failed' : plan.status === 'unsupported' ? 'unsupported' : plan.status === 'unknown' ? 'unknown' : plan.removableTargetIds.length ? 'ready-with-targets' : 'ready-empty'
  const verifiedOutput = processing?.status === 'success' && processing.outputVerification === 'passed' && authoritativeVerification ? processing.output : undefined
  return { state, targets, selectedTargetIds, requestedTargetIds: processing ? selectedTargetIds : [], removedTargetIds: processing?.removedTargetIds || [], preservedTargetIds: processing?.preservedTargetIds || plan.preservedTargetIds, limitations: plan.warnings, output: verifiedOutput ? { filename: verifiedOutput.filename, ownership: 'verified', downloadable: true } : undefined }
}

export function mapRealVerification(result?: VerificationResult, expected?: Readonly<{ sourceFingerprint: string; identity: VerificationResult['identity'] }>): VerificationViewModel {
  if (!result) return { state: 'not-run', checks: [], sourceBinding: 'unknown', identityBinding: 'unknown', preservedItems: [], removedItems: [], warnings: [], provenance: 'real' }
  const sourceMatched = Boolean(expected && result.sourceFingerprint === expected.sourceFingerprint)
  const identityMatched = Boolean(expected && JSON.stringify(result.identity) === JSON.stringify(expected.identity))
  const authoritative = result.status === 'success' && sourceMatched && identityMatched
  return { state: authoritative ? 'passed' : result.status === 'failed' ? 'failed' : 'not-run', checks: result.checks.map(check => ({ id: check.id, label: check.name, state: check.status === 'passed' ? 'passed' : check.status === 'failed' ? 'failed' : 'not-run' })), sourceBinding: sourceMatched ? 'matched' : 'unknown', identityBinding: identityMatched ? 'matched' : 'unknown', preservedItems: result.preservedTargetIds, removedItems: result.removedTargetIds, warnings: result.warnings, provenance: 'real' }
}

export function mapRealReport(input: Readonly<{ id: string; filename: string; format?: string; size?: number }>, findings: readonly PrivacyFindingViewModel[], removal: RemovalViewModel | undefined, verification: VerificationViewModel, limitations: readonly string[] = []): ReportViewModel {
  return { id: input.id, provenance: 'real', source: input, findingsBefore: findings, requestedActions: removal?.requestedTargetIds || [], actionsPerformed: removal?.removedTargetIds || [], verification, preservedItems: removal?.preservedTargetIds || [], removedItems: removal?.removedTargetIds || [], output: removal?.output ? { filename: removal.output.filename, size: removal.output.size, downloadable: removal.output.downloadable } : undefined, limitations: [...limitations, ...(removal?.limitations || [])], sessionOnly: true }
}
