'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Clock3, Code2, LockKeyhole, MapPin, Search, Shield, User, Camera } from 'lucide-react'
import { metadata, type MetadataItem } from '@/lib/notrace-demo'
import { toMetadataItems } from '@/lib/local-boundary/inspection-view-model'
import { usePrototype } from './provider'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GlassCard, InfoTip, RiskMeter, StatusBadge } from './primitives'

export function PrivacyPreview() {
  const reasons = [{ icon: MapPin, label: 'Precise location', detail: 'GPS coordinates & altitude', tone: 'danger' },{icon: Camera,label:'Device information',detail:'Camera model & serial number',tone:'warning'},{icon:Clock3,label:'Capture timestamp',detail:'When the moment happened',tone:'warning'},{icon:Code2,label:'Software metadata',detail:'Your editing tools & history',tone:'neutral'},{icon:User,label:'Creator information',detail:'Author name & copyright',tone:'warning'}] as const
  return <div className="privacy-preview"><h3 className="eyebrow">WHAT THIS FILE REVEALS</h3><div className="privacy-reasons">{reasons.map(({ icon: Icon, ...reason }) => <div key={reason.label}><Icon size={15} className={reason.tone} /><span>{reason.label}</span><InfoTip label={`About ${reason.label}`}>{reason.detail} — simulated finding.</InfoTip></div>)}</div></div>
}
export function MetadataRow({ item }: { item: MetadataItem }) {
  return <div className="metadata-row"><div className="metadata-field"><span>{item.label}</span>{item.risk && <span className={item.risk === 'High' ? 'risk-tag danger' : 'risk-tag muted'}>{item.risk}</span>}</div><span className="metadata-value font-mono">{item.value}</span><StatusBadge tone={item.capability === 'Protected' ? 'neutral' : item.capability === 'Unknown' ? 'warning' : 'accent'}>{item.capability === 'Protected' && <LockKeyhole size={11} />}{item.capability}</StatusBadge></div>
}
export function MetadataGroup({ category, items }: { category: string; items: MetadataItem[] }) {
  return <details className="metadata-group" open><summary><span>{category}<span className="count-label">{items.length}</span></span><ChevronDown size={15} /></summary>{items.map(item => <MetadataRow key={item.id} item={item} />)}</details>
}

export function InspectScreen() {
  const [query, setQuery] = useState('')
  const { selected, inspection } = usePrototype()
  const isDemo = selected?.demo === true
  const realResult = inspection?.status === 'success' && inspection.fileId === selected?.id ? inspection.result : undefined
  const realItems = realResult ? toMetadataItems(realResult) : []
  const items = isDemo ? metadata : realItems
  const categories = ['All', 'EXIF', 'IPTC', 'XMP', 'C2PA', 'Other']
  const currentInspection = inspection && inspection.fileId === selected?.id ? inspection : undefined
  const realStatus = !isDemo ? currentInspection?.status : undefined
  const categoryCount = new Set(items.map(item => item.category)).size
  const countText = isDemo ? '18 metadata items · 5 categories' : `${items.length} metadata item${items.length === 1 ? '' : 's'} · ${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}`
  const filtered = items.filter(item => `${item.label} ${item.value} ${item.capability}`.toLowerCase().includes(query.toLowerCase()))
  const statusMessage = realStatus === 'inspecting' ? 'Inspecting local JPEG…' : realStatus === 'unsupported' ? 'This local file is not a supported JPEG.' : realStatus === 'failed' ? 'Local JPEG inspection could not be completed.' : !isDemo && realStatus === 'success' && items.length === 0 ? 'No recognized metadata was found in this local JPEG.' : undefined
  const overview = isDemo ? <GlassCard className="inspection-overview"><RiskMeter /><PrivacyPreview /></GlassCard> : <GlassCard className="inspection-overview"><div className="panel-heading"><div><span className="eyebrow">LOCAL JPEG SCOPE</span><h2>Structural inspection</h2><p>Only recognized JPEG structures are shown below. Unsupported or ambiguous metadata may not be decoded.</p></div><StatusBadge tone="accent">Local result</StatusBadge></div></GlassCard>
  return <div className="screen-stack">{overview}<GlassCard className="metadata-panel"><div className="panel-heading"><div><h2>Under the surface</h2><p>{countText}</p></div><InfoTip>{isDemo ? 'All 18 fields are mock data, not extracted from your file.' : 'Fields shown were inspected locally. Raw media payloads are not displayed.'}</InfoTip></div><div className="metadata-search"><Search size={16} /><Input aria-label="Search metadata" placeholder="Search metadata, values, or capabilities…" value={query} onChange={e => setQuery(e.target.value)} /></div><Tabs defaultValue="All"><TabsList className="metadata-tabs">{categories.map(category => <TabsTrigger key={category} value={category}>{category}</TabsTrigger>)}</TabsList>{categories.map(category => <TabsContent key={category} value={category}><div className="metadata-table-heading"><span>FIELD</span><span>{isDemo ? 'MOCK VALUE' : 'VALUE'}</span><span>CAPABILITY</span></div>{statusMessage ? <div className="search-empty">{statusMessage}{!isDemo && realStatus === 'success' && <span> Only supported structures are reported.</span>}</div> : filtered.filter(m => category === 'All' || m.category === category).length === 0 ? <div className="search-empty">No metadata matches “{query}”.<button onClick={() => setQuery('')}>Clear search</button></div> : (category === 'All' ? categories.slice(1) : [category]).map(group => { const groupItems = filtered.filter(m => m.category === group); return groupItems.length ? <MetadataGroup key={group} category={group} items={groupItems} /> : null })}</TabsContent>)}</Tabs><div className="metadata-bottom"><Shield size={15} /><span>Protected and uncertain information is preserved by default.</span></div></GlassCard><div className="screen-actions"><span className="muted">See something you&apos;d rather not share?</span><Link href="/remove" className="primary-link">Choose a cleanup policy<ArrowRight size={16} /></Link></div></div>
}
