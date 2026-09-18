'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUp, ArrowUpRight, Fingerprint, LockKeyhole, Menu, Settings2, X } from 'lucide-react'
import { navigation } from '@/lib/notrace-demo'
import { cn } from '@/lib/utils'
import { usePrototype } from './provider'
import { GlassButton, LocalIndicator, Modal, StatusBadge } from './primitives'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [menu, setMenu] = useState(false)
  const [settings, setSettings] = useState(false)
  const [clear, setClear] = useState(false)
  const [scroll, setScroll] = useState(0)
  const { scenario, setScenario, clearSession, busy } = usePrototype()
  useEffect(() => { setMenu(false) }, [pathname])
  useEffect(() => {
    const onScroll = () => setScroll(window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight))
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return <>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="site-header">
      <div className="scroll-progress" style={{ transform: `scaleX(${scroll})` }} aria-hidden="true" />
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="NoTrace home"><span className="brand-mark"><Fingerprint size={24} strokeWidth={1.6} /></span><span>NoTrace<span className="brand-period">.</span></span></Link>
        <nav aria-label="Main navigation" className="desktop-nav">{navigation.map(item => <Link key={item.path} href={`/${item.path}`} className={cn('nav-link', pathname === `/${item.path}` && 'nav-active')} aria-current={pathname === `/${item.path}` ? 'page' : undefined}>{item.label}{item.path === 'ai-watermark' && <span className="nav-new">BETA</span>}</Link>)}</nav>
        <div className="header-actions"><span className="header-local"><LockKeyhole size={14} />Local by design</span><button className="icon-button" aria-label="Open settings" onClick={() => setSettings(true)}><Settings2 size={18} /></button><button className="icon-button mobile-menu-button" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} aria-controls="mobile-navigation" onClick={() => setMenu(!menu)}>{menu ? <X size={22} /> : <Menu size={22} />}</button></div>
      </div>
      {menu && <nav className="mobile-nav" id="mobile-navigation" aria-label="Mobile navigation">{navigation.map(item => <Link key={item.path} href={`/${item.path}`} aria-current={pathname === `/${item.path}` ? 'page' : undefined}>{item.label}<ArrowUpRight size={16} /></Link>)}</nav>}
    </header>
    {children}
    <footer className="site-footer"><div><Link href="/" className="footer-brand"><Fingerprint size={20} />NoTrace.</Link><span className="muted">Leave the moment. Not the metadata.</span></div><div className="footer-links"><Link href="/#faq">Questions?</Link><button onClick={() => setSettings(true)}>Privacy & settings</button><span className="prototype-label">UI prototype · v1.0</span></div></footer>
    {scroll > 0.35 && <button className="back-top icon-button" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}><ArrowUp size={18} /></button>}
    <Modal open={settings} onOpenChange={setSettings} title="Your space. Your settings." description="Session-only preferences. Nothing is stored when you reload.">
      <div className="settings-summary"><LocalIndicator /><StatusBadge tone="accent">Frontend prototype</StatusBadge></div>
      <p className="muted leading-relaxed">Files remain on this device and are read, inspected, and processed locally. The local workflow does not upload your files. Metadata, watermark signals, risk scores, and reports may use illustrative data where noted. No analytics, accounts, or cookies are used by the app.</p>
      <FieldGroup><Field><FieldLabel>Appearance</FieldLabel><div className="setting-value">Dark liquid glass <span className="muted">Always on</span></div></Field><Field><FieldLabel htmlFor="demo-scenario">Demo result scenario</FieldLabel><Select value={scenario} onValueChange={value => value && setScenario(value)} items={[{value:'normal',label:'Success'},{value:'partial',label:'Partial success'},{value:'error',label:'Processing error'}]}><SelectTrigger id="demo-scenario"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="normal">Success</SelectItem><SelectItem value="partial">Partial success</SelectItem><SelectItem value="error">Processing error</SelectItem></SelectGroup></SelectContent></Select></Field></FieldGroup>
      <p className="muted text-sm">Motion follows your device&apos;s reduced-motion preference.</p>
      <GlassButton variant="destructive" onClick={() => { setSettings(false); setClear(true) }} disabled={busy}>Clear this session</GlassButton>
      <p className="muted text-sm">Last updated September 13, 2026</p>
    </Modal>
    <Modal open={clear} onOpenChange={setClear} title="Clear this session?" description="Remove the file list, edits, and simulated reports from this session. Original files on your device are unaffected."><div className="action-row"><GlassButton onClick={() => setClear(false)}>Keep session</GlassButton><GlassButton variant="destructive" onClick={() => { clearSession(); setClear(false) }}>Clear session</GlassButton></div></Modal>
  </>
}
