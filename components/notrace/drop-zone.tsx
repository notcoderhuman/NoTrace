'use client'

import { useRef, useState, useEffect } from 'react'
import gsap from 'gsap'
import { ArrowRight, ImageIcon, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePrototype } from './provider'
import { GlassButton, LocalIndicator } from './primitives'

export function DropZone({ compact = false }: { compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const zone = useRef<HTMLDivElement>(null)
  const depth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const { addFiles, loadDemo, busy } = usePrototype()
  useEffect(() => {
    if (!zone.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const tween = gsap.to(zone.current, { scale: dragging ? 1.006 : 1, duration: 0.22, ease: 'power2.out' })
    return () => { tween.kill() }
  }, [dragging])
  return <div ref={zone} className={cn('drop-zone', compact && 'drop-zone-compact', dragging && 'is-dragging', busy && 'is-busy')} aria-busy={busy || undefined} onDragEnter={event => { event.preventDefault(); depth.current++; setDragging(true) }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDragLeave={event => { event.preventDefault(); depth.current--; if (depth.current === 0) setDragging(false) }} onDrop={event => { event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false); if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files) }}>
    <input ref={input} type="file" accept="image/jpeg,.jpg,.jpeg,image/png,.png" multiple tabIndex={-1} className="sr-only" aria-label="Choose local JPEG or PNG files" onChange={event => { const selectedFiles = event.target.files; if (selectedFiles?.length) addFiles(selectedFiles); event.target.value = '' }} />
    <div className="drop-zone-top"><span className="eyebrow">LOCAL WORKFLOW</span><LocalIndicator demo={false} short /></div>
    <div className="drop-zone-body"><div className="upload-symbol" aria-hidden="true"><Upload size={28} strokeWidth={1.3} /></div><h2>{busy ? 'Preparing your local workspace.' : dragging ? 'Release to inspect locally.' : 'Choose a file to inspect.'}</h2><p>{busy ? 'The current workflow is busy. Your original remains untouched.' : 'Drop a JPEG or PNG here, or choose one from this device.'}</p><div className="drop-actions"><GlassButton type="button" variant="primary" onClick={() => input.current?.click()} disabled={busy}>Browse Files<ArrowRight data-icon="inline-end" /></GlassButton></div></div>
    <div className="supported-formats" aria-label="Supported local format"><span><ImageIcon aria-hidden="true" size={14} />JPEG / JPG / PNG inspection</span></div>
    {!compact && <div className="demo-link-row"><span>Prefer a guided look?</span><button onClick={() => loadDemo()} disabled={busy}>Explore simulated demo <ArrowUpRightIcon /></button></div>}
  </div>
}
function ArrowUpRightIcon() { return <ArrowRight aria-hidden="true" size={14} className="-rotate-45" /> }
