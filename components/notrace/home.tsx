'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Check, ChevronDown, Eye, Fingerprint, LockKeyhole, ScanLine, ShieldCheck, SlidersHorizontal, Sparkles, WandSparkles } from 'lucide-react'
import { DropZone } from './drop-zone'
import { GlassButton, GlassCard, MotionReveal, StatusBadge } from './primitives'
import { usePrototype } from './provider'

const features = [
  { icon: Eye, title: 'See the invisible.', label: 'Inspect', text: 'Discover the metadata hiding behind your media.', href: '/inspect' },
  { icon: WandSparkles, title: 'Leave less behind.', label: 'Remove', text: 'Choose what stays. Clean up what doesn’t.', href: '/remove' },
  { icon: SlidersHorizontal, title: 'Make it yours.', label: 'Edit', text: 'Update the details you want to share.', href: '/edit' },
  { icon: ShieldCheck, title: 'Know what changed.', label: 'Verify', text: 'A clear before and after. Nothing left to guess.', href: '/reports' },
]
const faqs = [
  ['Does my media leave my device?', 'No. Real JPEG inspection and cleanup run locally in your browser; files are not uploaded. Demo mode uses clearly labelled illustrative data.'],
  ['Will NoTrace change my original files?', 'No. No media-processing engine is included in this prototype. Cleanup, editing, and verification are simulated, and your original files are never changed.'],
  ['Are content credentials and invisible watermarks the same?', 'No. C2PA / Content Credentials describe cryptographically signed provenance. Invisible watermarks are signals embedded in media. NoTrace shows these technologies separately, with simulated detection and support states.'],
  ['Can NoTrace detect every watermark?', 'This prototype does not detect any real watermark. The interface demonstrates supported, detected, not detected, unknown, and unsupported states. “No supported watermark detected” is not proof that no watermark exists.'],
  ['What can I download from this prototype?', 'You can copy or export a plain-text simulated privacy report. No sanitized media output is created. Session data disappears when the page is reloaded.'],
]
export function Home() {
  const { loadDemo } = usePrototype()
  return <main id="main-content" className="home-main" tabIndex={-1}>
    <section className="hero" aria-labelledby="hero-title"><MotionReveal className="hero-inner"><div className="hero-eyebrow"><span className="tiny-line" /> LESS EXPOSURE. MORE CONTROL. <span className="tiny-line" /></div><h1 id="hero-title" className="hero-title font-sans">NO TRACE<span className="hero-title-period">.</span></h1><div className="hero-copy text-balance"><p>Inspect what your media reveals. <span>Remove what you don&apos;t need.</span></p><p>Edit what you control. <span>Verify what changed.</span></p></div><div className="hero-privacy"><LockKeyhole size={14} strokeWidth={1.5} />Your media stays on this device.</div><DropZone /><div className="hero-assurances"><span><Check size={14} />No uploads</span><span><Check size={14} />No account required</span><span><Check size={14} />Originals untouched</span></div></MotionReveal></section>
    <section className="toolkit-section page-width" aria-label="The NoTrace toolkit"><div className="section-heading"><div><span className="eyebrow">THE MOMENT IS YOURS. THE DETAILS SHOULD BE TOO.</span><h2>A clean slate for your media.</h2></div><span className="section-aside">One toolkit. A lighter footprint.</span></div><div className="feature-grid">{features.map(({ icon: Icon, ...feature }) => <Link href={feature.href} key={feature.label} className="feature-card"><span className="feature-icon"><Icon size={23} strokeWidth={1.5} /></span><h3>{feature.title}</h3><p>{feature.text}</p><span className="feature-link">{feature.label}<ArrowRight size={15} /></span></Link>)}</div></section>
    <section className="demo-section page-width" aria-labelledby="demo-title"><GlassCard className="demo-showcase"><div className="demo-showcase-copy"><span className="eyebrow"><ScanLine size={15} /> A LOOK UNDER THE SURFACE</span><h2 id="demo-title">A photo says a lot.<br /><span className="muted">Sometimes, too much.</span></h2><p>A location. A device. A name. See the details a file can carry — and preview what happens when you take them back.</p><GlassButton onClick={() => loadDemo()}>Explore the demo<ArrowRight data-icon="inline-end" /></GlassButton><span className="demo-caption">Sample media. Simulated findings. Real clarity.</span></div><div className="demo-photo"><Image src="/images/alpine-demo.png" alt="Alpine peaks reflected in a tranquil mountain lake at dawn" fill sizes="(max-width: 700px) 90vw, 500px" /><div className="photo-label"><span><ImageGlyph /> alpine_morning.jpg</span><StatusBadge tone="warning">Location attached</StatusBadge></div></div></GlassCard></section>
    <section className="provenance-promo page-width"><div className="provenance-icon"><Fingerprint size={34} strokeWidth={1.2} /></div><div><span className="eyebrow">BEYOND METADATA</span><h2>Know the story behind the file.</h2><p>Explore AI watermarks and content credentials. Different technologies. Clearly separated.</p></div><Link href="/ai-watermark" className="text-link">AI Watermark & Provenance<ArrowRight size={16} /></Link></section>
    <section className="faq-section page-width" id="faq"><div><span className="eyebrow">A FEW THINGS, MADE CLEAR.</span><h2>Privacy without<br />the fine print.</h2><p className="muted">Designed around trust.<br />Transparent about its limits.</p></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}</div></section>
    <div className="prototype-notice page-width"><Sparkles size={16} /><p>You&apos;re exploring a UI prototype. All analysis, cleanup, watermark, and verification results are simulated. No media is processed.</p></div>
  </main>
}
function ImageGlyph() { return <ScanLine size={14} /> }
