'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Clock3, Code2, LockKeyhole, MapPin, Search, Shield, User, Camera } from 'lucide-react'
import { metadata } from '@/lib/notrace-demo'
import { mapRealInspection, mapRealRisk } from '@/lib/presentation/real-mapper'
import { mapDemoFindings, mapDemoMetadata, mapDemoRisk } from '@/lib/presentation/demo-mapper'
import type { PrivacyFindingViewModel, UnifiedMetadataViewModel } from '@/lib/presentation/models'
import { usePrototype } from './provider'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GlassButton, GlassCard, InfoTip, RiskMeter, StatusBadge } from './primitives'

export function PrivacyPreview({ findings = [] }: { findings?: readonly PrivacyFindingViewModel[] }) {
  const fallback = [{ key: 'location-evidence', icon: MapPin, label: 'Location evidence', detail: 'Current real parser does not establish GPS field absence.', tone: 'warning' }, { key: 'device-evidence', icon: Camera, label: 'Device evidence', detail: 'Current parser does not establish device identity absence.', tone: 'warning' }, { key: 'timestamp-evidence', icon: Clock3, label: 'Timestamp evidence', detail: 'Timestamp semantics are not decoded by the current parser.', tone: 'warning' }, { key: 'software-evidence', icon: Code2, label: 'Software evidence', detail: 'Software metadata is not fully decoded by the current parser.', tone: 'neutral' }, { key: 'creator-evidence', icon: User, label: 'Creator evidence', detail: 'Creator metadata is not fully decoded by the current parser.', tone: 'warning' }] as const
  const rows = findings.length ? findings.slice(0, 5).map(finding => ({ key: finding.id, label: finding.label, detail: finding.explanation, tone: finding.status === 'REMOVABLE' ? 'danger' : 'warning', icon: Shield })) : fallback
  return <div className="privacy-preview"><h3 className="eyebrow">WHAT THIS FILE REVEALS</h3><div className="privacy-reasons">{rows.map(({ icon: Icon, key, ...reason }) => <div key={key}><Icon size={15} className={reason.tone} /><span>{reason.label}</span><InfoTip label={`About ${reason.label}`}>{reason.detail}</InfoTip></div>)}</div></div>
}
export function MetadataRow({ item }: { item: UnifiedMetadataViewModel }) {
  const capability = item.classification === 'removable' ? 'Removable' : item.classification === 'protected' ? 'Protected' : item.classification === 'unsupported' ? 'Unsupported' : item.classification === 'unknown' ? 'Unknown' : 'Safe'
  return <div className="metadata-row"><div className="metadata-field"><span>{item.field}</span>{item.privacyRelevance !== 'unknown' && <span className={item.privacyRelevance === 'high' ? 'risk-tag danger' : 'risk-tag muted'}>{item.privacyRelevance}</span>}</div><span className="metadata-value font-mono">{item.value}</span><StatusBadge tone={capability === 'Protected' ? 'neutral' : capability === 'Unknown' || capability === 'Unsupported' ? 'warning' : 'accent'}>{capability === 'Protected' && <LockKeyhole size={11} />}{capability}</StatusBadge></div>
}
export function MetadataGroup({ category, items }: { category: string; items: UnifiedMetadataViewModel[] }) {
  return <details className="metadata-group" open><summary><span>{category}<span className="count-label">{items.length}</span></span><ChevronDown size={15} /></summary>{items.map(item => <MetadataRow key={item.id} item={item} />)}</details>
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
  const categories = ['All', 'EXIF', 'IPTC', 'XMP', 'C2PA', 'Other']
  const currentInspection = inspection && inspection.fileId === selected?.id ? inspection : undefined
  const realStatus = !isDemo ? currentInspection?.status : undefined
  const categoryCount = new Set(items.map(item => item.category)).size
  const countText = `${items.length} metadata item${items.length === 1 ? '' : 's'} · ${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}`
  const filtered = items.filter(item => `${item.field} ${item.value} ${item.classification}`.toLowerCase().includes(query.toLowerCase()))
  const formatLabel = selected?.format || 'file'
  const statusMessage = realStatus === 'inspecting' ? `Inspecting local ${formatLabel}…` : realStatus === 'unsupported' ? `This local ${formatLabel} cannot be inspected yet. JPEG / JPG inspection is currently supported.` : realStatus === 'failed' ? `Local ${formatLabel} inspection could not be completed.` : realStatus === 'cancelled' ? `Inspection of this local ${formatLabel} was cancelled.` : !isDemo && (realStatus === 'success' || realStatus === 'partial') && items.length === 0 ? `No recognized metadata was found in this local ${formatLabel}.` : undefined
  const statusActions = !isDemo && selected && realStatus && realStatus !== 'success' && realStatus !== 'partial' ? <div className="action-row"><GlassButton type="button" onClick={() => retryInspection(selected.id)}>Retry inspection</GlassButton>{realStatus === 'inspecting' && <GlassButton type="button" onClick={() => cancelInspection(selected.id)}>Cancel inspection</GlassButton>}</div> : null
  const overview = <GlassCard className="inspection-overview"><RiskMeter assessment={assessment} /><PrivacyPreview findings={findings} /></GlassCard>
  return <div className="screen-stack">{overview}<GlassCard className="metadata-panel"><div className="panel-heading"><div><h2>Under the surface</h2><p>{countText}</p></div><InfoTip>{isDemo ? 'Demo fixture values are illustrative and not extracted from your file.' : 'Fields shown were inspected locally. Raw media payloads are not displayed.'}</InfoTip></div><div className="metadata-search"><Search size={16} /><Input aria-label="Search metadata" placeholder="Search metadata, values, or capabilities…" value={query} onChange={e => setQuery(e.target.value)} /></div><Tabs defaultValue="All"><TabsList className="metadata-tabs">{categories.map(category => <TabsTrigger key={category} value={category}>{category}</TabsTrigger>)}</TabsList>{categories.map(category => <TabsContent key={category} value={category}><div className="metadata-table-heading"><span>FIELD</span><span>{isDemo ? 'DEMO VALUE' : 'VALUE'}</span><span>CAPABILITY</span></div>{statusMessage ? <div className="search-empty" role={realStatus === 'failed' || realStatus === 'unsupported' ? 'alert' : 'status'}>{statusMessage}{!isDemo && (realStatus === 'success' || realStatus === 'partial') && <span> Only supported structures are reported.</span>}{statusActions}</div> : filtered.filter(m => category === 'All' || m.category === category).length === 0 ? <div className="search-empty">No metadata matches “{query}”.<button onClick={() => setQuery('')}>Clear search</button></div> : (category === 'All' ? categories.slice(1) : [category]).map(group => { const groupItems = filtered.filter(m => m.category === group); return groupItems.length ? <MetadataGroup key={group} category={group} items={groupItems} /> : null })}</TabsContent>)}</Tabs><div className="metadata-bottom"><Shield size={15} /><span>Protected and uncertain information is preserved by default.</span></div></GlassCard><div className="screen-actions"><span className="muted">See something you&apos;d rather not share?</span><Link href="/remove" className="primary-link">Choose a cleanup policy<ArrowRight size={16} /></Link></div></div>
}
