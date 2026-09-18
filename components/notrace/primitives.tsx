'use client'

import { useEffect, useRef, type ReactNode, type ComponentProps } from 'react'
import gsap from 'gsap'
import { Check, CircleHelp, LoaderCircle, LockKeyhole, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProgressViewModel, RiskAssessmentViewModel } from '@/lib/presentation/models'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function GlassCard({ children, className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('glass-card', className)} {...props}>{children}</section>
}
export function GlassButton({ className, variant = 'outline', ...props }: ComponentProps<typeof Button>) {
  return <Button variant={variant} className={cn('glass-button', className)} {...props} />
}
export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent' }) {
  const Icon = tone === 'success' ? Check : tone === 'danger' || tone === 'warning' ? TriangleAlert : tone === 'accent' ? ShieldCheck : CircleHelp
  return <Badge variant="outline" className={cn('status-badge', `status-${tone}`)}><Icon aria-hidden="true" />{children}</Badge>
}
export function LocalIndicator({ short = false, demo = true }: { short?: boolean; demo?: boolean }) {
  return <span className="local-indicator"><span aria-hidden="true" className="status-dot" />{short ? 'Local only' : 'Processing locally'}<span className="sr-only"> — {demo ? 'prototype, simulated results' : 'local inspection; original remains untouched'}</span></span>
}
export function InfoTip({ children, label = 'More information' }: { children: ReactNode; label?: string }) {
  return <Tooltip><TooltipTrigger aria-label={label} className="info-trigger"><CircleHelp size={16} /></TooltipTrigger><TooltipContent>{children}</TooltipContent></Tooltip>
}
export function Modal({ title, description, children, open, onOpenChange }: { title: string; description: string; children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="notrace-modal"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>
}
export function ProgressBar({ value, label, mode = 'determinate' }: { value?: number; label: string; mode?: ProgressViewModel['mode'] }) {
  return <div className="progress-block" aria-busy={mode === 'indeterminate'}><div className="flex items-center justify-between"><span>{label}</span>{mode === 'determinate' && typeof value === 'number' && <span className="font-mono">{Math.round(value)}%</span>}</div><Progress value={mode === 'determinate' ? value ?? null : null} aria-label={label} /></div>
}
export function RiskMeter({ assessment, value, compact = false }: { assessment?: RiskAssessmentViewModel; value?: number; compact?: boolean }) {
  const state = assessment?.state || (typeof value === 'number' ? 'AVAILABLE' : 'NOT_AVAILABLE')
  if (state === 'NOT_AVAILABLE') return <div className={cn('risk-meter', compact && 'risk-compact')} role="status"><div className="risk-ring risk-low"><div><strong className="font-sans">—</strong><span>/ 100</span></div></div><div className="flex flex-col gap-2"><span className="eyebrow">Privacy risk</span><StatusBadge tone="neutral">Not available</StatusBadge><span className="muted text-sm">No evidence-based score is available for this file.</span></div></div>
  const score = assessment?.score ?? value ?? 0
  const low = score <= 39
  const partial = assessment?.state === 'PARTIAL'
  return <div className={cn('risk-meter', compact && 'risk-compact')}><div className={cn('risk-ring', low && 'risk-low')} style={{ '--risk': `${score}%` } as React.CSSProperties} role="img" aria-label={`${assessment?.source === 'demo' ? 'Simulated ' : ''}privacy risk ${score} out of 100`}><div><strong className="font-sans">{score}</strong><span>/ 100</span></div></div><div className="flex flex-col gap-2"><span className="eyebrow">Privacy risk</span><StatusBadge tone={low ? 'success' : 'danger'}>{partial ? 'Partial' : assessment?.level || (low ? 'Low' : 'High')}</StatusBadge><span className="muted text-sm">{assessment?.source === 'demo' ? 'Illustrative demo score' : assessment?.reasons.join(' ') || 'Based on detected metadata exposure.'}</span>{assessment && <span className="muted text-xs">Methodology: {assessment.methodology.id} v{assessment.methodology.version}</span>}</div></div>
}
export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <GlassCard className="empty-state"><div className="icon-tile"><ShieldCheck size={28} /></div><h2>{title}</h2><p>{description}</p>{children}</GlassCard>
}
export function ErrorState({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return <GlassCard className="empty-state"><XCircle className="danger" size={32} /><h2>{title}</h2><p>{description}</p>{onRetry && <GlassButton onClick={onRetry}>Try again</GlassButton>}</GlassCard>
}
export function LoadingState({ value, label }: { value: number; label: string }) {
  return <GlassCard className="loading-state" aria-live="polite"><LoaderCircle className="loading-icon" size={32} /><h2>{label}</h2><p>Simulating the workflow. No media processing is taking place.</p><ProgressBar value={value} label="Demo progress" /></GlassCard>
}
export function MotionReveal({ children, className, motionKey }: { children: ReactNode; className?: string; motionKey?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      if (ref.current) gsap.fromTo(ref.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' })
    })
    return () => mm.revert()
  }, [motionKey])
  return <div ref={ref} className={className}>{children}</div>
}
export function PrivacyNote() {
  return <p className="privacy-note"><LockKeyhole size={14} aria-hidden="true" />Your media stays on this device. Original files remain untouched.</p>
}
