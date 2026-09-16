import type { DemoFile, DemoReport, MetadataItem } from '../notrace-demo'
import type { RemovalTargetViewModel, ReportViewModel, RiskAssessmentViewModel, UnifiedFileViewModel, UnifiedMetadataViewModel, PrivacyFindingViewModel, ProgressViewModel, VerificationViewModel } from './models'

function classification(value: MetadataItem['capability']): UnifiedMetadataViewModel['classification'] {
  if (value === 'Safe to remove') return 'removable'
  if (value === 'Editable') return 'removable'
  if (value === 'Protected') return 'protected'
  if (value === 'Unsupported') return 'unsupported'
  return 'unknown'
}
function relevance(value: MetadataItem['risk']): UnifiedMetadataViewModel['privacyRelevance'] { return value?.toLowerCase() as UnifiedMetadataViewModel['privacyRelevance'] || 'unknown' }

export function mapDemoFile(file: DemoFile): UnifiedFileViewModel {
  const supported = file.format.toUpperCase() === 'JPEG' || file.format.toUpperCase() === 'JPG'
  return { id: file.id, filename: file.name, format: { id: file.format.toLowerCase(), label: file.format, state: supported ? 'known' : 'unsupported' }, size: undefined, source: 'demo', originalPreserved: true, preview: { state: file.kind === 'image' ? 'unavailable' : 'not-applicable' }, capability: { inspect: supported ? 'available' : 'unavailable', remove: supported ? 'available' : 'unavailable', verify: supported ? 'available' : 'unavailable' }, operationState: file.state === 'processing' ? 'processing' : file.state === 'success' ? 'complete' : file.state === 'partial' ? 'failed' : file.state === 'error' ? 'failed' : file.state === 'unsupported' ? 'unsupported' : 'admitted' }
}

export function mapDemoMetadata(items: readonly MetadataItem[]): UnifiedMetadataViewModel[] {
  return items.map(item => ({ id: item.id, category: item.category, field: item.label, value: item.value, valueState: item.value === 'Unknown' ? 'unknown' : 'present', classification: classification(item.capability), privacyRelevance: relevance(item.risk), removable: item.capability === 'Safe to remove', evidence: { source: 'demo-fixture', targetId: item.capability === 'Safe to remove' ? item.id : undefined } }))
}

export function mapDemoFindings(items: readonly MetadataItem[]): PrivacyFindingViewModel[] {
  return items.map(item => ({ id: item.id, label: item.label, category: item.category, status: item.capability === 'Safe to remove' ? 'REMOVABLE' : item.capability === 'Protected' ? 'PROTECTED' : item.capability === 'Unsupported' ? 'UNSUPPORTED' : item.capability === 'Unknown' ? 'UNKNOWN' : 'DETECTED', explanation: item.capability === 'Unknown' ? 'The demo fixture does not establish this field.' : 'Illustrative demo finding.', evidence: item.value, targetId: item.capability === 'Safe to remove' ? item.id : undefined, source: 'demo' }))
}

export function mapDemoRisk(report: Pick<DemoReport, 'risk' | 'partial'>): RiskAssessmentViewModel {
  return { state: report.partial ? 'PARTIAL' : 'AVAILABLE', score: report.risk, level: report.risk >= 70 ? 'High' : report.risk >= 40 ? 'Medium' : 'Low', reasons: ['Illustrative demo assessment.'], contributingFindingIds: [], confidence: 'unknown', methodology: { id: 'notrace-demo', version: '1' }, source: 'demo' }
}

export function mapDemoProgress(state: ProgressViewModel['state'], percentage: number, detail?: string): ProgressViewModel { return { state, mode: 'determinate', percentage: Math.max(0, Math.min(100, percentage)), label: state.replaceAll('-', ' '), detail } }

export function mapDemoVerification(partial: boolean): VerificationViewModel { return { state: partial ? 'failed' : 'passed', checks: [{ id: 'demo-verification', label: 'Simulated verification', state: partial ? 'failed' : 'passed' }], sourceBinding: 'unknown', identityBinding: 'unknown', preservedItems: [], removedItems: [], warnings: ['Demo verification is simulated.'], provenance: 'demo' } }

export function mapDemoReport(report: DemoReport, findings: readonly PrivacyFindingViewModel[] = []): ReportViewModel {
  const verification = mapDemoVerification(report.partial)
  return { provenance: 'demo', source: { filename: report.filename, format: report.format }, findingsBefore: findings, requestedActions: report.changes.filter(change => change.action !== 'Preserved').map(change => change.label), actionsPerformed: report.changes.filter(change => change.action !== 'Preserved').map(change => change.label), verification, preservedItems: report.changes.filter(change => change.action === 'Preserved').map(change => change.label), removedItems: report.changes.filter(change => change.action === 'Removed').map(change => change.label), output: undefined, limitations: ['Demo report; no media file was created.'], sessionOnly: true }
}

export function mapDemoTargets(items: readonly MetadataItem[]): RemovalTargetViewModel[] { return items.map(item => ({ id: item.id, label: item.label, category: item.category, capability: item.capability === 'Safe to remove' ? 'removable' : item.capability === 'Protected' ? 'protected' : item.capability === 'Unsupported' ? 'unsupported' : item.capability === 'Unknown' ? 'unknown' : 'preserved', selectable: item.capability === 'Safe to remove', reason: 'Demo fixture classification.' })) }
