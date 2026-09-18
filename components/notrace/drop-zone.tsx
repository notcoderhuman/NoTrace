'use client'

import { useRef, useState, useEffect } from 'react'
import gsap from 'gsap'
import { ArrowDownToLine, ArrowRight, ImageIcon, Upload } from 'lucide-react'
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
    const tween = gsap.to(zone.current, { scale: dragging ? 1.012 : 1, duration: 0.25, ease: 'power2.out' })
    return () => { tween.kill() }
  }, [dragging])
  return <div ref={zone} className={cn('drop-zone', compact && 'drop-zone-compact', dragging && 'is-dragging')} onDragEnter={event => { event.preventDefault(); depth.current++; setDragging(true) }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDragLeave={event => { event.preventDefault(); depth.current--; if (depth.current === 0) setDragging(false) }} onDrop={event => { event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false); if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files) }}>
    <input ref={input} type="file" accept="image/jpeg,.jpg,.jpeg" multiple tabIndex={-1} className="sr-only" aria-label="Choose local JPEG files" onChange={event => { const selectedFiles = event.target.files; if (selectedFiles?.length) addFiles(selectedFiles); event.target.value = '' }} />
    <div className="drop-zone-top"><span className="eyebrow">A little less exposed.</span><LocalIndicator demo={false} /></div>
    <div className="drop-zone-body"><div className="upload-symbol"><Upload size={30} strokeWidth={1.3} /></div><h2>{dragging ? 'Right here. Still only yours.' : 'Your files. Your business.'}</h2><p>Drop your media here. Take control of what goes with it.</p><div className="drop-actions"><GlassButton type="button" variant="default" onClick={() => input.current?.click()} disabled={busy}><ArrowDownToLine data-icon="inline-start" />Drop Files</GlassButton><GlassButton type="button" onClick={() => input.current?.click()} disabled={busy}>Browse Files<ArrowRight data-icon="inline-end" /></GlassButton></div></div>
    <div className="supported-formats" aria-label="Supported local format"><span><ImageIcon size={14} />JPEG / JPG inspection</span><span><span aria-hidden="true">·</span> PNG unsupported</span></div>
    {!compact && <div className="demo-link-row"><span>Just looking around?</span><button onClick={() => loadDemo()} disabled={busy}>Try a sample file <ArrowUpRightIcon /></button></div>}
  </div>
}
function ArrowUpRightIcon() { return <ArrowRight size={14} className="-rotate-45" /> }
