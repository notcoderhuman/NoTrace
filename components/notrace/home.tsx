'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronDown, Eye, FileCheck2, ScanLine, SlidersHorizontal, Sparkles, WandSparkles } from 'lucide-react'
import { DropZone } from './drop-zone'
import { GlassButton, GlassCard, MotionReveal, ProvenanceIndicator, StatusBadge } from './primitives'
import { usePrototype } from './provider'

const features = [
  { icon: WandSparkles, title: 'Remove', label: 'Remove supported traces', text: 'Review a local plan and verify what changes.', href: '/remove', state: 'Local workflow' },
  { icon: SlidersHorizontal, title: 'Edit', label: 'Edit file details', text: 'Explore the details you can control.', href: '/edit', state: 'Available where supported' },
  { icon: ScanLine, title: 'Provenance', label: 'AI watermark & provenance', text: 'Keep different signal types clearly separated.', href: '/ai-watermark', state: 'Simulated' },
  { icon: FileCheck2, title: 'Reports', label: 'Review session evidence', text: 'Return to inspection and verification records.', href: '/reports', state: 'Session only' },
]
const faqs = [
  ['Does my media leave my device?', 'No. Real JPEG and PNG inspection and supported cleanup run locally in your browser; files are not uploaded. Demo mode uses clearly labelled illustrative data.'],
  ['Will NoTrace change my original files?', 'No. Real cleanup produces a separate verified result. Your original file remains untouched. Demo mode uses illustrative data and does not process media.'],
  ['What can NoTrace inspect today?', 'The current local workflow accepts JPEG / JPG and PNG files for inspection. Supported JPEG comments and explicitly approved PNG text chunks can be removed; other structures remain preserved or unsupported.'],
  ['Are content credentials and invisible watermarks the same?', 'No. C2PA / Content Credentials describe cryptographically signed provenance. Invisible watermarks are signals embedded in media. NoTrace shows these technologies separately, with simulated detection and support states.'],
  ['What can I download?', 'Only a locally verified output can be downloaded from the real workflow. Reports are session-only presentation data.'],
]
export function Home() {
  const { loadDemo } = usePrototype()
  return <main id="main-content" className="home-main" tabIndex={-1}>
    <section className="hero" aria-labelledby="hero-title"><MotionReveal className="hero-inner"><div className="hero-eyebrow"><span className="tiny-line" /> LOCAL MEDIA WORKSPACE <span className="tiny-line" /></div><h1 id="hero-title" className="hero-title font-sans">SEE WHAT<br /><span className="hero-title-muted">TRAVELS WITH</span><br />YOUR FILE<span className="hero-title-period">.</span></h1><div className="hero-copy text-balance"><p>Inspect what your media carries.</p><p><span>Then decide what stays with it.</span></p></div><DropZone /><p className="hero-local-context"><span className="hero-local-rule" /><ProvenanceIndicator demo={false} /><span>Files are read on this device. Your original remains untouched.</span></p></MotionReveal></section>
    <section className="toolkit-section page-width" aria-label="The NoTrace toolkit"><div className="section-heading"><div><span className="eyebrow">AFTER INSPECTION</span><h2>Keep the next step deliberate.</h2></div><span className="section-aside">Inspect first. Choose with evidence.</span></div><div className="toolkit-primary"><Link href="/inspect" className="toolkit-inspect"><span className="toolkit-inspect-icon"><Eye size={22} aria-hidden="true" /></span><span><strong>Inspect your file</strong><small>Start with a local evidence view before making a change.</small></span><ArrowRight size={18} aria-hidden="true" /></Link></div><div className="feature-grid">{features.map(({ icon: Icon, ...feature }) => <Link href={feature.href} key={feature.label} className="feature-card"><span className="feature-card-top"><Icon size={18} aria-hidden="true" /><small>{feature.state}</small></span><h3>{feature.title}</h3><p>{feature.text}</p><span className="feature-link">{feature.label}<ArrowRight size={14} aria-hidden="true" /></span></Link>)}</div></section>
    <section className="demo-section page-width" aria-labelledby="demo-title"><GlassCard className="demo-showcase"><div className="demo-showcase-copy"><span className="eyebrow"><ScanLine aria-hidden="true" size={15} /> ILLUSTRATIVE WORKFLOW</span><h2 id="demo-title">A photo carries context.<br /><span className="muted">See it before you share it.</span></h2><p>Explore a sample file with simulated findings. It is a visual tour, not an analysis of your media.</p><GlassButton variant="quiet" onClick={() => loadDemo()}>Explore the simulated demo<ArrowRight data-icon="inline-end" /></GlassButton><ProvenanceIndicator demo /><span className="demo-caption">Sample media · illustrative findings · no real file processing</span></div><div className="demo-photo"><Image src="/images/alpine-demo.png" alt="Illustrative alpine sample — not a preview of your own file" fill sizes="(max-width: 700px) 90vw, 500px" /><div className="photo-label"><span><ImageGlyph aria-hidden="true" /> alpine_morning.jpg</span><StatusBadge tone="demo" kind="provenance">Simulated</StatusBadge></div></div></GlassCard></section>
    <section className="provenance-promo page-width"><div className="provenance-icon"><ScanLine aria-hidden="true" size={30} strokeWidth={1.2} /></div><div><span className="eyebrow">SEPARATE SIGNALS</span><h2>Metadata, provenance, and watermarks.</h2><p>Explore different technologies without blending their evidence or limitations.</p></div><Link href="/ai-watermark" className="text-link">AI Watermark & Provenance<ArrowRight aria-hidden="true" size={16} /></Link></section>
    <section className="faq-section page-width" id="faq"><div><span className="eyebrow">A FEW THINGS, MADE CLEAR.</span><h2>Privacy without<br />the fine print.</h2><p className="muted">Designed around trust.<br />Transparent about its limits.</p></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown aria-hidden="true" size={17} /></summary><p>{answer}</p></details>)}</div></section>
    <div className="prototype-notice page-width"><Sparkles aria-hidden="true" size={16} /><p>Local JPEG inspection and supported cleanup are available in the real workflow. Demo surfaces are explicitly simulated and illustrative.</p></div>
  </main>
}
function ImageGlyph(props: { 'aria-hidden'?: 'true' }) { return <ScanLine size={14} {...props} /> }
