import Link from 'next/link'
import { ArrowLeft, Fingerprint } from 'lucide-react'

export default function NotFound() {
  return <main id="main-content" tabIndex={-1} className="page-width not-found-page"><div className="not-found-code">404</div><Fingerprint size={38} className="accent" /><span className="eyebrow">NOT EVERY TRACE LEADS SOMEWHERE.</span><h1>This one leads nowhere.</h1><p>The page you&apos;re looking for isn&apos;t here.<br />Your files are still right where you left them.</p><Link className="primary-link" href="/"><ArrowLeft size={16} />Back to your toolkit</Link></main>
}
