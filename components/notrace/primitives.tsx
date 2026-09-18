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

type Surface = 'environment' | 'panel' | 'raised' | 'modal' | 'inset'
export function GlassCard({ children, className, surface = 'panel', ...props }: ComponentProps<'section'> & { surface?: Surface }) {
  return <section className={cn('glass-card', `glass-surface-${surface}`, className)} {...props}>{children}</section>
}

type GlassButtonVariant = NonNullable<ComponentProps<typeof Button>['variant']> | 'primary' | 'quiet' | 'icon'
export function GlassButton({ className, variant = 'outline', ...props }: Omit<ComponentProps<typeof Button>, 'variant'> & { variant?: GlassButtonVariant; size?: ComponentProps<typeof Button>['size'] }) {
  const resolvedVariant = variant === 'primary' ? 'default' : variant === 'quiet' || variant === 'icon' ? 'ghost' : variant
  const size = variant === 'icon' ? 'icon' : props.size
  return <Button variant={resolvedVariant} size={size} className={cn('glass-button', variant === 'icon' && 'glass-button-icon', className)} {...props} />
}

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'unsupported' | 'demo'
type StatusKind = 'operation' | 'capability' | 'verification' | 'provenance'
export function StatusBadge({ children, tone = 'neutral', kind, ...props }: { children: ReactNode; tone?: StatusTone; kind?: StatusKind } & Omit<ComponentProps<typeof Badge>, 'children'>) {
  const Icon = tone === 'success' ? Check : tone === 'danger' || tone === 'warning' ? TriangleAlert : tone === 'accent' ? ShieldCheck : CircleHelp
  return <Badge variant="outline" className={cn('status-badge', `status-${tone}`, kind && `status-kind-${kind}`)} {...props}><Icon aria-hidden="true" />{children}</Badge>
}

export function ProvenanceIndicator({ demo = false, short = false }: { demo?: boolean; short?: boolean }) {
  return <span className={cn('local-indicator', demo && 'provenance-demo')}><span aria-hidden="true" className="status-dot" />{demo ? (short ? 'Simulated' : 'Simulated · Illustrative') : (short ? 'Local workflow' : 'Local workflow · Evidence-backed')}<span className="sr-only"> — {demo ? 'simulated results' : 'evidence-backed local workflow'}</span></span>
}
export function LocalIndicator({ short = false, demo = true }: { short?: boolean; demo?: boolean }) {
  return <ProvenanceIndicator demo={demo} short={short} />
}

export function InfoTip({ children, label = 'More information' }: { children: ReactNode; label?: string }) {
  return <Tooltip><TooltipTrigger aria-label={label} className="info-trigger"><CircleHelp aria-hidden="true" size={16} /></TooltipTrigger><TooltipContent>{children}</TooltipContent></Tooltip>
}
export function Modal({ title, description, children, open, onOpenChange }: { title: string; description: string; children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="notrace-modal"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>
}

export function ProgressBar({ value, label, mode = 'determinate' }: { value?: number; label: string; mode?: ProgressViewModel['mode'] }) {
  const determinate = mode === 'determinate' && typeof value === 'number'
  return <div className="progress-block" aria-busy={!determinate}><div className="flex items-center justify-between"><span>{label}</span>{determinate && <span className="font-mono">{Math.round(value)}%</span>}</div><Progress value={determinate ? value : null} aria-label={label} /></div>
}

export function RiskMeter({ assessment, value, compact = false }: { assessment?: RiskAssessmentViewModel; value?: number; compact?: boolean }) {
  const state = assessment?.state || (typeof value === 'number' ? 'AVAILABLE' : 'NOT_AVAILABLE')
  if (state === 'NOT_AVAILABLE') return <div className={cn('risk-meter', compact && 'risk-compact')} role="status"><div className="risk-ring risk-unavailable"><div><strong className="font-sans">—</strong><span>/ 100</span></div></div><div className="flex flex-col gap-2"><span className="eyebrow">Privacy risk</span><StatusBadge tone="neutral">Not available</StatusBadge><span className="muted text-sm">No evidence-based score is available for this file.</span></div></div>
  const score = assessment?.score ?? value ?? 0
  const low = score <= 39
  const partial = assessment?.state === 'PARTIAL'
  return <div className={cn('risk-meter', compact && 'risk-compact')}><div className={cn('risk-ring', low && 'risk-low', partial && 'risk-partial')} style={{ '--risk': `${score}%` } as React.CSSProperties} role="img" aria-label={`${assessment?.source === 'demo' ? 'Simulated ' : ''}privacy risk ${score} out of 100`}><div><strong className="font-sans">{score}</strong><span>/ 100</span></div></div><div className="flex flex-col gap-2"><span className="eyebrow">Privacy risk</span><StatusBadge tone={partial ? 'warning' : low ? 'success' : 'danger'}>{partial ? 'Partial' : assessment?.level || (low ? 'Low' : 'High')}</StatusBadge><span className="muted text-sm">{assessment?.source === 'demo' ? 'Illustrative demo score' : assessment?.reasons.join(' ') || 'Based on detected metadata exposure.'}</span>{assessment && <span className="muted text-xs">Methodology: {assessment.methodology.id} v{assessment.methodology.version}</span>}</div></div>
}

export function EvidenceRow({ field, value, state, explanation }: { field: ReactNode; value: ReactNode; state?: ReactNode; explanation?: string }) {
  return <div className="evidence-row"><div className="evidence-field">{field}</div><div className="evidence-value" title={explanation}>{value}</div>{state && <div className="evidence-state">{state}</div>}{explanation && <InfoTip label={`About ${typeof field === 'string' ? field : 'this evidence'}`}>{explanation}</InfoTip>}</div>
}

export function EmptyState({ title, description, children, intent = 'first-use' }: { title: string; description: string; children?: ReactNode; intent?: 'first-use' | 'no-match' | 'no-history' | 'unsupported' }) {
  const Icon = intent === 'unsupported' ? XCircle : intent === 'no-match' ? CircleHelp : ShieldCheck
  return <GlassCard className={cn('empty-state', `empty-state-${intent}`)}><div className="icon-tile"><Icon aria-hidden="true" size={28} /></div><h2>{title}</h2><p>{description}</p>{children}</GlassCard>
}
export function ErrorState({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return <GlassCard className="empty-state error-state" role="alert"><XCircle aria-hidden="true" className="danger" size={32} /><h2>{title}</h2><p>{description}</p>{onRetry && <GlassButton onClick={onRetry}>Try again</GlassButton>}</GlassCard>
}
export function LoadingState({ value, label, description = 'Simulating the workflow. No media processing is taking place.' }: { value?: number; label: string; description?: string }) {
  const mode = typeof value === 'number' ? 'determinate' : 'indeterminate'
  return <GlassCard className="loading-state" aria-live="polite" aria-busy="true"><LoaderCircle aria-hidden="true" className="loading-icon" size={32} /><h2>{label}</h2><p>{description}</p><ProgressBar value={value} mode={mode} label={mode === 'determinate' ? 'Progress' : 'Work in progress'} /></GlassCard>
}
export function MotionReveal({ children, className, motionKey }: { children: ReactNode; className?: string; motionKey?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      if (ref.current) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--notrace-motion-spatial').trim()
        const duration = raw.endsWith('ms') ? Number.parseFloat(raw) / 1000 : 0.44
        gsap.fromTo(ref.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration, ease: 'power3.out' })
      }
    })
    return () => mm.revert()
  }, [motionKey])
  return <div ref={ref} className={className}>{children}</div>
}
export function PrivacyNote() {
  return <p className="privacy-note"><LockKeyhole aria-hidden="true" size={14} />Your media stays on this device. Original files remain untouched.</p>
}
