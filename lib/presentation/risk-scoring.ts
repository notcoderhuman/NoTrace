import type { PresentationSource, RiskAssessmentViewModel } from './models'

export type RiskEvidenceState = 'PRESENT' | 'NOT_DETECTED' | 'UNKNOWN' | 'UNSUPPORTED'
export type RiskCategory = 'LOCATION' | 'DEVICE' | 'CREATOR' | 'TIMESTAMP' | 'IPTC' | 'XMP' | 'SOFTWARE' | 'JPEG_COM' | 'GENERAL_EXIF' | 'ICC'
export type RiskEvidence = Readonly<{ id: string; category: RiskCategory; state: RiskEvidenceState }>

export const PRIVACY_EXPOSURE_METHODOLOGY = { id: 'notrace-metadata-exposure', version: '1' } as const
export const PRIVACY_EXPOSURE_WEIGHTS: Readonly<Record<RiskCategory, number>> = {
  LOCATION: 35, DEVICE: 20, CREATOR: 15, TIMESTAMP: 10, IPTC: 8, XMP: 7, SOFTWARE: 5, JPEG_COM: 5, GENERAL_EXIF: 4, ICC: 1,
}
const CATEGORY_LABELS: Readonly<Record<RiskCategory, string>> = { LOCATION: 'Location information', DEVICE: 'Camera/device information', CREATOR: 'Creator information', TIMESTAMP: 'Timestamp information', IPTC: 'IPTC metadata', XMP: 'XMP metadata', SOFTWARE: 'Software information', JPEG_COM: 'JPEG comment data', GENERAL_EXIF: 'General EXIF metadata', ICC: 'ICC color profile' }

export function clampRiskScore(score: number): number { return Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0)) }
export function classifyRisk(score: number): 'Low' | 'Medium' | 'High' { const value = clampRiskScore(score); return value >= 70 ? 'High' : value >= 40 ? 'Medium' : 'Low' }

export function scoreRisk(evidence: readonly RiskEvidence[], source: PresentationSource, options: Readonly<{ methodologyId?: string; methodologyVersion?: string }> = {}): RiskAssessmentViewModel {
  const byCategory = new Map<RiskCategory, RiskEvidence>()
  for (const item of evidence) {
    if (!item || typeof item.id !== 'string' || !Object.prototype.hasOwnProperty.call(PRIVACY_EXPOSURE_WEIGHTS, item.category) || !['PRESENT', 'NOT_DETECTED', 'UNKNOWN', 'UNSUPPORTED'].includes(item.state)) continue
    const existing = byCategory.get(item.category)
    if (!existing || (item.state === 'PRESENT' && existing.state !== 'PRESENT')) byCategory.set(item.category, item)
  }
  const items = [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id))
  const present = items.filter(item => item.state === 'PRESENT')
  const uncertain = items.filter(item => item.state === 'UNKNOWN' || item.state === 'UNSUPPORTED')
  const score = clampRiskScore(present.reduce((total, item) => total + PRIVACY_EXPOSURE_WEIGHTS[item.category], 0))
  const hasEvidence = items.length > 0
  const level = classifyRisk(score)
  const categories = present.map(item => CATEGORY_LABELS[item.category])
  const reasons = categories.length ? [`Detected exposure: ${categories.join(', ')}.`] : ['No present metadata exposure was established.']
  if (uncertain.length) reasons.push('Some metadata categories remain unknown or unsupported with the current parser.')
  return { state: !hasEvidence ? 'NOT_AVAILABLE' : uncertain.length ? 'PARTIAL' : 'AVAILABLE', score: hasEvidence ? score : undefined, level: hasEvidence ? level : undefined, reasons, contributingFindingIds: present.map(item => item.id), confidence: uncertain.length ? 'low' : hasEvidence ? 'medium' : 'unknown', methodology: { id: options.methodologyId || PRIVACY_EXPOSURE_METHODOLOGY.id, version: options.methodologyVersion || PRIVACY_EXPOSURE_METHODOLOGY.version }, source }
}
