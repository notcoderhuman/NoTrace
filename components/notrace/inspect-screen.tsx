'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Info, Search, TriangleAlert } from 'lucide-react'
import { metadata } from '@/lib/notrace-demo'
import { mapRealInspection, mapRealRisk } from '@/lib/presentation/real-mapper'
import { mapDemoFindings, mapDemoMetadata, mapDemoRisk } from '@/lib/presentation/demo-mapper'
import type { PrivacyFindingViewModel, UnifiedMetadataViewModel } from '@/lib/presentation/models'
import { usePrototype } from './provider'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GlassButton, GlassCard, EvidenceRow, InfoTip, LoadingState, RiskMeter, StatusBadge } from './primitives'

function findingTone(status: PrivacyFindingViewModel['status']): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'unsupported' | 'demo' {
  if (status === 'REMOVABLE') return 'accent'
  if (status === 'DETECTED') return 'warning'
  if (status === 'PROTECTED') return 'neutral'
  if (status === 'UNSUPPORTED') return 'unsupported'
  return 'neutral'
}
function findingLabel(status: PrivacyFindingViewModel['status']) { return status.replaceAll('_', ' ') }

export function PrivacyPreview({ findings = [] }: { findings?: readonly PrivacyFindingViewModel[] }) {
  return <section className="evidence-overview" aria-labelledby="evidence-overview-title"><div className="evidence-overview-heading"><div><span className="eyebrow">OBSERVED EVIDENCE</span><h2 id="evidence-overview-title">What this file reveals</h2></div><span className="evidence-count">{findings.length} finding{findings.length === 1 ? '' : 's'}</span></div><div className="evidence-overview-list">{findings.length ? findings.slice(0, 6).map(finding => <EvidenceRow key={finding.id} field={finding.category || finding.label} value={<span>{finding.label}{finding.evidence ? ` · ${finding.evidence}` : ''}</span>} state={<StatusBadge tone={findingTone(finding.status)}>{findingLabel(finding.status)}</StatusBadge>} explanation={finding.explanation} />) : <div className="evidence-empty"><span>No evidence rows are available yet.</span><small>Inspection results will appear here when the local workflow completes.</small></div>}</div></section>
}

function metadataStateLabel(item: UnifiedMetadataViewModel) {
  if (item.classification === 'removable') return 'Removable'
  if (item.classification === 'protected') return 'Protected'
  if (item.classification === 'unsupported') return 'Unsupported'
  if (item.classification === 'unknown') return 'Unknown'
  if (item.valueState === 'absent') return 'Not detected'
  if (item.valueState === 'present') return 'Detected'
  return 'Safe'
}
function metadataTone(item: UnifiedMetadataViewModel) {
  const label = metadataStateLabel(item)
  return label === 'Removable' ? 'accent' as const : label === 'Detected' ? 'warning' as const : label === 'Unknown' || label === 'Unsupported' ? 'warning' as const : 'neutral' as const
}
export function MetadataRow({ item }: { item: UnifiedMetadataViewModel }) {
  const label = metadataStateLabel(item)
  return <EvidenceRow field={<span>{item.field}{item.privacyRelevance !== 'unknown' && <small className={item.privacyRelevance === 'high' ? 'risk-tag danger' : 'risk-tag muted'}>{item.privacyRelevance}</small>}</span>} value={<span className="font-mono">{item.value}</span>} state={<StatusBadge tone={metadataTone(item)}>{label}</StatusBadge>} explanation={`Evidence source: ${item.evidence.source}.`} />
}
export function MetadataGroup({ category, items }: { category: string; items: UnifiedMetadataViewModel[] }) {
  return <details className="metadata-group" open><summary><span>{category}<span className="count-label">{items.length}</span></span><ChevronDown aria-hidden="true" size={15} /></summary><div className="metadata-group-rows">{items.map(item => <MetadataRow key={item.id} item={item} />)}</div></details>
}

export function InspectScreen() {
  const [query, setQuery] = useState('')
  const { selected, inspection, currentRiskAssessment, retryInspection, cancelInspection } = usePrototype()
  const isDemo = selected?.demo === true
  const realResult = (inspection?.status === 'success' || inspection?.status === 'partial') && inspection.fileId === selected?.id ? inspection.result : undefined
  const demoItems = mapDemoMetadata(metadata)
  const realMapped = realResult ? mapRealInspection(realResult) : { metadata: [], findings: [] }
  const items = isDemo ? demoItems : realMapped.metadata
  const findings = isDemo ? mapDemoFindings(metadata) : realMapped.findings
  const assessment = isDemo ? mapDemoRisk({ risk: 82, partial: false }) : currentRiskAssessment
  const categories = Array.from(new Set(['EXIF', 'IPTC', 'XMP', 'C2PA', 'Other', ...items.map(item => item.category)]))
  const currentInspection = inspection && inspection.fileId === selected?.id ? inspection : undefined
  const realStatus = !isDemo ? currentInspection?.status : undefined
  const formatLabel = selected?.format || 'file'
  const filtered = items.filter(item => `${item.field} ${item.value} ${item.classification}`.toLowerCase().includes(query.toLowerCase()))
  const statusMessage = realStatus === 'inspecting' ? `Inspecting local ${formatLabel}…` : realStatus === 'unsupported' ? `This local ${formatLabel} is unsupported. JPEG / JPG inspection is currently supported.` : realStatus === 'failed' ? `Local ${formatLabel} inspection could not be completed.` : realStatus === 'cancelled' ? `Inspection of this local ${formatLabel} was cancelled.` : !isDemo && (realStatus === 'success' || realStatus === 'partial') && items.length === 0 ? `No recognized metadata was found in this local ${formatLabel}.` : undefined
  const statusActions = !isDemo && selected && realStatus && !['success', 'partial'].includes(realStatus) ? <div className="action-row"><GlassButton type="button" onClick={() => retryInspection(selected.id)}>Retry inspection</GlassButton>{realStatus === 'inspecting' && <GlassButton type="button" variant="quiet" onClick={() => cancelInspection(selected.id)}>Cancel inspection</GlassButton>}</div> : null
  const canRemove = findings.some(finding => finding.status === 'REMOVABLE')
  const categoryCount = new Set(items.map(item => item.category)).size
  const fileLabel = selected?.name || 'Selected file'
  return <div className="inspect-screen"><header className="inspect-route-header"><div><span className="eyebrow">INSPECT / FORENSIC WORKSPACE</span><h2>See what travels with this file.</h2><p>Evidence from the selected file, interpreted locally and shown without changing the original.</p></div><StatusBadge tone={isDemo ? 'demo' : 'accent'} kind="provenance">{isDemo ? 'Simulated · Illustrative' : 'Local workflow · Evidence-backed'}</StatusBadge></header><section className="inspect-source" aria-labelledby="inspect-source-title"><div className="inspect-source-copy"><span className="eyebrow">SOURCE</span><h2 id="inspect-source-title" title={fileLabel}>{fileLabel}</h2><div className="inspect-source-meta"><span>{formatLabel}</span><span>{selected?.size || 'Size unavailable'}</span><span>{isDemo ? 'Illustrative sample' : 'Original preserved'}</span></div></div><div className="inspect-state" role={realStatus === 'failed' || realStatus === 'unsupported' ? 'alert' : 'status'}><span className="inspect-state-label">INSPECTION STATE</span><strong>{isDemo ? 'Illustrative findings' : realStatus === 'inspecting' ? 'Inspecting locally…' : realStatus === 'partial' ? 'Partial inspection' : realStatus === 'success' ? 'Inspection complete' : realStatus === 'cancelled' ? 'Inspection cancelled' : realStatus === 'failed' ? 'Inspection failed' : realStatus === 'unsupported' ? 'Unsupported' : 'Ready to inspect'}</strong>{statusActions}</div></section>{realStatus === 'inspecting' && <LoadingState label="Inspecting locally…" description="Reading the selected file on this device. No output is being created." />}{statusMessage && realStatus !== 'inspecting' && <div className={`inspect-status inspect-status-${realStatus === 'failed' || realStatus === 'unsupported' ? 'error' : 'neutral'}`}><TriangleAlert aria-hidden="true" size={17} /><span>{statusMessage}</span>{statusActions}</div>}<section className="inspect-overview-plane"><PrivacyPreview findings={findings} /><aside className="inspect-risk"><div className="inspect-risk-heading"><span className="eyebrow">INTERPRETATION</span><InfoTip>{isDemo ? 'This score is illustrative demo data.' : 'This assessment is derived from the local evidence model and its stated methodology.'}</InfoTip></div><RiskMeter assessment={assessment} compact /><div className="inspect-risk-meta"><span>Methodology</span><strong>{assessment.methodology.id} v{assessment.methodology.version}</strong><span>Confidence</span><strong>{assessment.confidence}</strong></div></aside></section><section className="metadata-panel evidence-plane"><div className="panel-heading"><div><span className="eyebrow">EVIDENCE ARCHIVE</span><h2>Metadata observed</h2><p>{items.length} metadata item{items.length === 1 ? '' : 's'} · {categoryCount} categor{categoryCount === 1 ? 'y' : 'ies'}</p></div><InfoTip>{isDemo ? 'Demo fixture values are illustrative and not extracted from your file.' : 'Fields shown were inspected locally. Raw media payloads are not displayed.'}</InfoTip></div><div className="metadata-search"><Search aria-hidden="true" size={16} /><Input aria-label="Search metadata" placeholder="Search fields, values, or states…" value={query} onChange={e => setQuery(e.target.value)} /></div><Tabs defaultValue="All"><TabsList className="metadata-tabs"><TabsTrigger value="All">All</TabsTrigger>{categories.map(category => <TabsTrigger key={category} value={category}>{category}</TabsTrigger>)}</TabsList>{['All', ...categories].map(category => <TabsContent key={category} value={category}><div className="metadata-table-heading"><span>FIELD</span><span>OBSERVATION</span><span>STATE</span></div>{statusMessage && category === 'All' && realStatus && !['success', 'partial'].includes(realStatus) ? null : filtered.filter(item => category === 'All' || item.category === category).length === 0 ? <div className="search-empty">No metadata matches “{query}”.<button onClick={() => setQuery('')}>Clear search</button></div> : (category === 'All' ? categories : [category]).map(group => { const groupItems = filtered.filter(item => item.category === group); return groupItems.length ? <MetadataGroup key={group} category={group} items={groupItems} /> : null })}</TabsContent>)}</Tabs><div className="metadata-bottom"><Info aria-hidden="true" size={15} /><span>Unknown and protected structures remain distinct and are preserved by default.</span></div></section>{canRemove ? <div className="screen-actions inspect-next-action"><span className="muted">Removable evidence is present in the current inspection.</span><Link href="/remove" className="primary-link">Choose a cleanup policy<ArrowRight aria-hidden="true" size={15} /></Link></div> : <div className="screen-actions inspect-next-action"><span className="muted">Inspection is informational. No supported cleanup target is currently available.</span></div>}</div>
}
