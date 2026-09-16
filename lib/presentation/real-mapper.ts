import type { InspectionResult } from '../processing-core/domain/metadata'
import type { RemovalPlan, ProcessingResult } from '../processing-core/domain/operation'
import type { VerificationResult } from '../processing-core/domain/result'
import type { ProgressViewModel, ReportViewModel, RiskAssessmentViewModel, UnifiedFileViewModel, UnifiedMetadataViewModel, PrivacyFindingViewModel, RemovalViewModel, VerificationViewModel } from './models'

const categoryLabel: Record<string, string> = { EXIF: 'EXIF', IPTC: 'IPTC', XMP: 'XMP', C2PA: 'C2PA', container: 'Container', other: 'Other' }
function metadataClass(value: string): UnifiedMetadataViewModel['classification'] { return value === 'SAFE_TO_REMOVE' || value === 'EDITABLE' ? 'removable' : value === 'PROTECTED' ? 'protected' : value === 'UNSUPPORTED' ? 'unsupported' : value === 'UNKNOWN' ? 'unknown' : 'safe' }
function capability(result: InspectionResult, operation: 'inspect' | 'remove' | 'verify'): UnifiedFileViewModel['capability'][typeof operation] { if (result.status === 'unsupported' || result.format.state === 'unsupported') return 'unavailable'; if (result.status === 'failed') return 'unknown'; return operation === 'inspect' ? 'available' : result.format.state === 'supported' ? 'available' : 'unknown' }

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

export function mapRealRisk(): RiskAssessmentViewModel { return { state: 'NOT_AVAILABLE', reasons: [], contributingFindingIds: [], confidence: 'unknown', methodology: { id: 'not-implemented', version: '1' }, source: 'real' } }
export function mapRealProgress(state: ProgressViewModel['state'], detail?: string): ProgressViewModel { return { state, mode: 'indeterminate', label: state.replaceAll('-', ' '), detail } }

export function mapRealRemoval(plan: RemovalPlan, selectedTargetIds: readonly string[] = [], processing?: ProcessingResult): RemovalViewModel {
  const targets = plan.targets.map(target => ({ id: target.id, label: target.category, category: target.category, capability: target.removable ? 'removable' as const : target.classification === 'PROTECTED' ? 'protected' as const : target.classification === 'UNKNOWN' ? 'unknown' as const : 'preserved' as const, selectable: target.removable && plan.removableTargetIds.includes(target.id), reason: target.reason }))
  const state = processing?.outputVerification === 'passed' ? 'verified' : processing?.status === 'failed' ? 'failed' : plan.status === 'unsupported' ? 'unsupported' : plan.status === 'unknown' ? 'unknown' : plan.removableTargetIds.length ? 'ready-with-targets' : 'ready-empty'
  return { state, targets, selectedTargetIds, requestedTargetIds: processing ? selectedTargetIds : [], removedTargetIds: processing?.removedTargetIds || [], preservedTargetIds: processing?.preservedTargetIds || plan.preservedTargetIds, limitations: plan.warnings, output: processing?.output ? { filename: processing.output.filename, ownership: processing.outputVerification === 'passed' ? 'verified' : 'execution', downloadable: processing.outputVerification === 'passed' } : undefined }
}

export function mapRealVerification(result?: VerificationResult): VerificationViewModel {
  if (!result) return { state: 'not-run', checks: [], sourceBinding: 'unknown', identityBinding: 'unknown', preservedItems: [], removedItems: [], warnings: [], provenance: 'real' }
  return { state: result.status === 'success' ? 'passed' : result.status === 'failed' ? 'failed' : 'not-run', checks: result.checks.map(check => ({ id: check.id, label: check.name, state: check.status === 'passed' ? 'passed' : check.status === 'failed' ? 'failed' : 'not-run' })), sourceBinding: result.sourceFingerprint ? 'matched' : 'unknown', identityBinding: result.identity ? 'matched' : 'unknown', preservedItems: result.preservedTargetIds, removedItems: result.removedTargetIds, warnings: result.warnings, provenance: 'real' }
}

export function mapRealReport(input: Readonly<{ filename: string; format?: string; size?: number }>, findings: readonly PrivacyFindingViewModel[], removal: RemovalViewModel, verification: VerificationViewModel, limitations: readonly string[] = []): ReportViewModel {
  return { provenance: 'real', source: input, findingsBefore: findings, requestedActions: removal.requestedTargetIds, actionsPerformed: removal.removedTargetIds, verification, preservedItems: removal.preservedTargetIds, removedItems: removal.removedTargetIds, output: removal.output ? { filename: removal.output.filename, size: removal.output.size, downloadable: removal.output.downloadable } : undefined, limitations: [...limitations, ...removal.limitations], sessionOnly: true }
}
