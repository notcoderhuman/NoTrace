'use client'

import { useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ArrowRight, Check, FileText, ImageIcon, Info, LoaderCircle, Music2, Plus, TriangleAlert, Video, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Section, navigation } from '@/lib/notrace-demo'
import type { UnifiedFileViewModel } from '@/lib/presentation/models'
import { usePrototype } from './provider'
import { DropZone } from './drop-zone'
import { GlassButton, GlassCard, ErrorState, LoadingState, LocalIndicator, MotionReveal, PrivacyNote, ProgressBar, StatusBadge } from './primitives'
import { InspectScreen } from './inspect-screen'
import { RemoveScreen } from './remove-screen'
import { EditScreen } from './edit-screen'
import { WatermarkPanel } from './watermark-panel'
import { ReportsScreen } from './report-panels'

const headings: Record<Section, { title: string; subtitle: string }> = {
  inspect: { title: 'Make the invisible, visible.', subtitle: 'A closer look at what your media carries with it.' },
  remove: { title: 'Keep the moment. Lose the traces.', subtitle: 'Choose a cleanup policy. Preview the changes. Stay in control.' },
  edit: { title: 'The details are yours to decide.', subtitle: 'Edit what you control. Preserve what your file needs.' },
  'ai-watermark': { title: 'AI Watermark & Provenance', subtitle: 'Two different signals. One transparent view of your media.' },
  reports: { title: 'Every change, accounted for.', subtitle: 'A clear record of your simulated processing and verification.' },
}
export function Workspace({ section }: { section: Section }) {
  const { selected, loadDemo, scanning, busy, progress, retryFile } = usePrototype()
  const heading = headings[section]
  const isDemo = selected?.demo === true
  return <main id="main-content" tabIndex={-1} className="workspace page-width">
    <div className="workspace-topline"><Link href="/" className="back-link"><ArrowLeft aria-hidden="true" size={14} />Your toolkit</Link><LocalIndicator demo={selected ? isDemo : true} /></div>
    <div className="workspace-heading"><div><div className="eyebrow">{navigation.find(n => n.path === section)?.label} <span className="eyebrow-divider">/</span> NOTRACE WORKSPACE</div><h1>{heading.title}</h1><p>{heading.subtitle}</p></div><div className="workspace-context"><span className="workspace-context-label">{section === 'reports' ? 'Session evidence archive' : 'Workspace context'}</span><StatusBadge tone={isDemo || !selected ? 'demo' : 'accent'} kind="provenance">{selected && !isDemo ? 'Local workflow' : 'Simulated'}</StatusBadge></div></div>
    <div className="workspace-banner"><Info size={15} /><p>{selected && !isDemo ? 'Your file is inspected on this device. Original files remain untouched.' : 'Illustrative results only. Files are not analyzed or modified.'} <strong>Your media stays on this device.</strong></p></div>
    {section === 'reports' ? <MotionReveal motionKey={section}><ReportsScreen /></MotionReveal> : !selected ? <MotionReveal className="workspace-empty"><DropZone compact /><div className="empty-options"><span>Start with something familiar.</span><GlassButton onClick={() => loadDemo()}>Try a sample file<ArrowRight data-icon="inline-end" /></GlassButton><GlassButton onClick={() => loadDemo(true)} variant="ghost">Explore a demo batch</GlassButton></div></MotionReveal> : <div className="workspace-grid"><FileSidebar /><MotionReveal key={selected.id} motionKey={section} className="workspace-content">{selected.demo && scanning ? <LoadingState value={45} label="Discovering the details…" /> : busy ? <LoadingState value={progress} label={progress < 30 ? 'Reading demo metadata…' : progress < 65 ? 'Simulating your changes…' : progress < 88 ? 'Comparing before and after…' : 'Running simulated verification…'} /> : selected.state === 'unsupported' ? <ErrorState title={selected.demo ? 'This format is outside the demo.' : 'This local file is not supported.'} description={selected.demo ? `${selected.format} is shown as unsupported. Required or uncertain information will never be removed. Try a JPEG, MP4, audio file, or document instead.` : `${selected.format} is not supported for local inspection. No file contents were modified. Select a supported JPEG to continue.`} onRetry={() => selected.demo ? loadDemo() : undefined} /> : selected.state === 'error' ? <ErrorState title="This demo hit a snag." description="The simulated file could not be processed. No source file was read or changed. Reset this scenario and try the workflow again." onRetry={() => retryFile(selected.id)} /> : section === 'inspect' ? <InspectScreen /> : section === 'remove' ? <RemoveScreen /> : section === 'edit' ? <EditScreen /> : section === 'ai-watermark' && !isDemo ? <GlassCard className="empty-state"><h2>Local provenance detection is not available.</h2><p>No local detector is enabled for this file. No watermark or provenance facts were inferred.</p></GlassCard> : <WatermarkPanel />}</MotionReveal></div>}
    <div className="workspace-bottom"><PrivacyNote /></div>
  </main>
}
const statusTone = { ready: 'neutral', processing: 'accent', success: 'success', partial: 'warning', error: 'danger', unsupported: 'neutral' } as const
const statusLabel = { ready: 'Ready', processing: 'In progress', success: 'Success', partial: 'Partial success', error: 'Error', unsupported: 'Unsupported' }
function FileCard({ file }: { file: UnifiedFileViewModel }) {
  const { selected, selectFile, removeFile, busy } = usePrototype()
  const Icon = file.format.label.toLowerCase().includes('video') ? Video : file.format.label.toLowerCase().includes('audio') ? Music2 : file.format.label.toLowerCase().includes('document') ? FileText : ImageIcon
  const state = file.operationState === 'complete' ? 'success' : file.operationState === 'failed' ? 'error' : file.operationState
  const tone = state in statusTone ? statusTone[state as keyof typeof statusTone] : 'neutral'
  const label = file.operationState === 'unsupported' ? 'Unsupported' : file.operationState === 'probing' ? 'Probing' : state in statusLabel ? statusLabel[state as keyof typeof statusLabel] : 'Ready'
  return <div className={cn('file-card', selected?.id === file.id && 'file-selected')}><button disabled={busy} onClick={() => selectFile(file.id)} className="file-select" aria-label={`Select ${file.filename}`} aria-pressed={selected?.id === file.id}><Icon size={19} /><span className="file-card-info"><strong className="truncate">{file.filename}</strong><span>{file.size?.label || file.format.label}<span className={cn('file-state', `status-${tone}`)}>{state === 'processing' ? <LoaderCircle size={12} className="loading-icon" /> : state === 'success' ? <Check size={12} /> : state === 'error' ? <TriangleAlert size={12} /> : null}{label}</span></span></span></button><button onClick={() => removeFile(file.id)} disabled={busy} className="file-dismiss" aria-label={`Remove ${file.filename} from session`}><X size={13} /></button></div>
}
function FileSidebar() {
  const { files, selected, previewUrl, previewError, setPreviewError, addFiles, loadDemo, busy, progress, presentationFiles } = usePrototype()
  const input = useRef<HTMLInputElement>(null)
  if (!selected) return null
  const done = files.filter(f => ['success', 'partial'].includes(f.state)).length
  return <aside className="file-sidebar" aria-label="Files in this session"><GlassCard className="queue-card"><div className="panel-heading"><span className="eyebrow">YOUR FILES <span className="count-label">{files.length}</span></span><button type="button" className="icon-button" aria-label="Add more files" disabled={busy} onClick={event => { event.preventDefault(); input.current?.click() }}><Plus size={16} /></button><input type="file" accept="image/jpeg,.jpg,.jpeg" multiple ref={input} className="sr-only" tabIndex={-1} aria-label="Add local JPEG files" onChange={event => { const selectedFiles = event.target.files; if (selectedFiles?.length) addFiles(selectedFiles); event.target.value = '' }} /></div><div className="file-list">{presentationFiles.map(file => <FileCard key={file.id} file={file} />)}</div>{(busy || done > 0) && <div className="queue-progress"><ProgressBar value={busy ? progress : done / files.length * 100} label={`${done} of ${files.length} complete`} /></div>}<button className="queue-demo-button" disabled={busy} onClick={() => loadDemo(true)}><Plus size={13} />Load demo batch</button></GlassCard><GlassCard className="file-preview-card"><div className="file-preview">{selected.demo && selected.kind === 'image' ? <Image src="/images/alpine-demo.png" alt="Illustrative alpine sample — not a preview of your own file" fill sizes="(max-width: 767px) 90vw, 280px" /> : !selected.demo && selected.kind === 'image' && previewUrl && !previewError ? <img src={previewUrl} alt={`Local preview of ${selected.name}`} className="local-file-preview" onLoad={() => setPreviewError(false)} onError={() => setPreviewError(true)} /> : <div className="file-preview-icon"><ImageIcon size={42} /><span>{!selected.demo && previewError ? 'Preview unavailable' : selected.demo ? 'Demo media' : 'Local preview'}</span></div>}<span className="preview-caption">{selected.demo ? 'ILLUSTRATIVE PREVIEW' : 'LOCAL FILE SELECTED'}</span></div><div className="file-details"><h2 className="truncate">{selected.name}</h2><span>{selected.format} <span>·</span> {selected.size}</span><dl>{selected.demo && <div><dt>Demo dimensions</dt><dd>{selected.kind === 'image' ? '6000 × 4000' : selected.kind === 'video' ? '1920 × 1080' : 'Not applicable'}</dd></div>}<div><dt>Source</dt><dd>{selected.demo ? 'Sample file' : 'This device'}</dd></div><div><dt>Original</dt><dd className="success">Untouched</dd></div></dl></div></GlassCard><p className="sidebar-note">This is a prototype. Every finding, score, and preview is illustrative.</p></aside>
}
