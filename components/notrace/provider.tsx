'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { metadata, sampleFile, type DemoFile, type DemoReport } from '@/lib/notrace-demo'
import { createBrowserFileInput } from '@/lib/local-boundary/browser-input'
import { createDefaultFormatAdapterRegistry } from '@/lib/local-boundary/default-registry'
import { createInspectionBoundary } from '@/lib/local-boundary/inspection-boundary'
import { createPlanningBoundary } from '@/lib/local-boundary/planning-boundary'
import { createProcessingBoundary } from '@/lib/local-boundary/processing-boundary'
import type { LocalInput } from '@/lib/processing-core/domain/input'
import type { InspectionResult } from '@/lib/processing-core/domain/metadata'
import type { BoundaryError } from '@/lib/processing-core/domain/result'
import type { LocalProcessingBoundary } from '@/lib/processing-core/domain/boundary'
import type { OutputArtifact } from '@/lib/processing-core/domain/artifact'
import type { ProcessingResult, RemovalApproval, RemovalPlan } from '@/lib/processing-core/domain/operation'
import type { BoundaryResult } from '@/lib/processing-core/domain/result'

type InspectionState =
  | { fileId: string; status: 'idle' | 'inspecting' }
  | { fileId: string; status: 'success'; result: InspectionResult }
  | { fileId: string; status: 'unsupported' | 'failed'; error: BoundaryError }

type RemovalState =
  | { fileId: string; status: 'idle' | 'planning' }
  | { fileId: string; status: 'ready' | 'approval-pending'; plan: RemovalPlan; selectedTargetIds: readonly string[] }
  | { fileId: string; status: 'processing'; plan: RemovalPlan; selectedTargetIds: readonly string[] }
  | { fileId: string; status: 'success'; result: ProcessingResult }
  | { fileId: string; status: 'unsupported' | 'failed'; error: BoundaryError }

type PrototypeContext = {
  files: DemoFile[]; selected: DemoFile | undefined; selectFile: (id: string) => void;
  addFiles: (files: FileList | File[]) => void; loadDemo: (batch?: boolean) => void;
  removeFile: (id: string) => void; clearSession: () => void; retryFile: (id: string) => void;
  reports: DemoReport[]; currentReport: DemoReport | undefined;
  run: (policy: string, removed: string[], edits?: Record<string, string>, batch?: boolean) => void;
  progress: number; busy: boolean; scanning: boolean; scenario: string; setScenario: (value: string) => void;
  drafts: Record<string, string>; setDraft: (key: string, value: string) => void;
  inspection: InspectionState | undefined;
  removal: RemovalState | undefined;
  planRealRemoval: (fileId: string) => void;
  setRemovalTargets: (fileId: string, targetIds: readonly string[]) => void;
  approveAndProcessRemoval: (fileId: string) => void;
  downloadVerifiedRemoval: (fileId: string) => Promise<BoundaryResult<void>>;
}
const Prototype = createContext<PrototypeContext | null>(null)
export function usePrototype() {
  const context = useContext(Prototype)
  if (!context) throw new Error('NoTrace must be inside its prototype provider')
  return context
}
export function PrototypeProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [files, setFiles] = useState<DemoFile[]>([])
  const [selectedId, selectFile] = useState('')
  const [reports, setReports] = useState<DemoReport[]>([])
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scenario, setScenario] = useState('normal')
  const [allDrafts, setAllDrafts] = useState<Record<string, Record<string, string>>>({})
  const [inspection, setInspection] = useState<InspectionState>()
  const [removal, setRemoval] = useState<RemovalState>()
  const localInputs = useRef(new Map<string, LocalInput>())
  const verifiedArtifacts = useRef(new Map<string, OutputArtifact>())
  const inspectionBoundary = useRef<LocalProcessingBoundary | null>(null)
  const planningBoundary = useRef<LocalProcessingBoundary | null>(null)
  const processingBoundary = useRef<LocalProcessingBoundary | null>(null)
  const inspectionAbort = useRef<AbortController | null>(null)
  const removalAbort = useRef<AbortController | null>(null)
  const removalRequest = useRef(0)
  const registry = useRef(createDefaultFormatAdapterRegistry())
  if (!inspectionBoundary.current) inspectionBoundary.current = createInspectionBoundary(registry.current)
  if (!planningBoundary.current) planningBoundary.current = createPlanningBoundary(registry.current)
  if (!processingBoundary.current) processingBoundary.current = createProcessingBoundary(registry.current)
  const animation = useRef<gsap.core.Tween | null>(null)
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const running = useRef(false)
  const selected = files.find(file => file.id === selectedId)
  useEffect(() => () => {
    animation.current?.kill()
    if (scanTimer.current) clearTimeout(scanTimer.current)
    inspectionAbort.current?.abort()
    removalAbort.current?.abort()
    for (const artifact of verifiedArtifacts.current.values()) artifact.dispose()
    verifiedArtifacts.current.clear()
    for (const input of localInputs.current.values()) input.release()
    localInputs.current.clear()
  }, [])
  function inspectRealFile(fileId: string) {
    const input = localInputs.current.get(fileId)
    if (!input || fileId !== selectedId) return
    inspectionAbort.current?.abort()
    const controller = new AbortController()
    inspectionAbort.current = controller
    setInspection({ fileId, status: 'inspecting' })
    void inspectionBoundary.current!.inspect(input, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || selectedId !== fileId || localInputs.current.get(fileId) !== input) return
      if (result.ok) setInspection({ fileId, status: 'success', result: result.value })
      else setInspection({ fileId, status: result.error.code === 'UNSUPPORTED' ? 'unsupported' : 'failed', error: result.error })
    })
  }
  useEffect(() => {
    if (!selected || selected.demo) return
    inspectRealFile(selected.id)
  }, [selectedId])
  function planRealRemoval(fileId: string) {
    const file = files.find(item => item.id === fileId)
    const input = localInputs.current.get(fileId)
    if (!file || file.demo || !input || fileId !== selectedId) return
    removalAbort.current?.abort()
    const requestId = ++removalRequest.current
    const controller = new AbortController()
    removalAbort.current = controller
    setRemoval({ fileId, status: 'planning' })
    void planningBoundary.current!.planRemoval({ input, fieldIds: [], policy: 'jpeg-com' }, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || requestId !== removalRequest.current || selectedId !== fileId || localInputs.current.get(fileId) !== input) return
      if (result.ok) setRemoval({ fileId, status: result.value.status === 'ready' ? 'ready' : 'idle', plan: result.value, selectedTargetIds: [] } as RemovalState)
      else setRemoval({ fileId, status: result.error.code === 'UNSUPPORTED' ? 'unsupported' : 'failed', error: result.error })
    })
  }
  function setRemovalTargets(fileId: string, targetIds: readonly string[]) {
    setRemoval(current => current && current.fileId === fileId && (current.status === 'ready' || current.status === 'approval-pending') ? { ...current, status: 'ready', selectedTargetIds: [...new Set(targetIds)] } : current)
  }
  function approveAndProcessRemoval(fileId: string) {
    const current = removal
    const input = localInputs.current.get(fileId)
    if (!input || !current || current.fileId !== fileId || current.status !== 'ready' || selectedId !== fileId || selected?.demo || !current.plan.removableTargetIds.length) return
    const targetIds = [...new Set(current.selectedTargetIds)]
    if (!targetIds.length || targetIds.some(id => !current.plan.removableTargetIds.includes(id))) return
    removalAbort.current?.abort()
    const requestId = ++removalRequest.current
    const controller = new AbortController()
    removalAbort.current = controller
    const approval: RemovalApproval = { planId: current.plan.id, inputId: input.descriptor.id, approvedTargetIds: targetIds, approvedAt: Date.now() }
    setRemoval({ fileId, status: 'processing', plan: current.plan, selectedTargetIds: targetIds })
    void processingBoundary.current!.execute({ operation: 'remove', input, plan: current.plan, approval }, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || requestId !== removalRequest.current || selectedId !== fileId || localInputs.current.get(fileId) !== input) { if (result.ok) result.value.output?.artifact.dispose(); return }
      if (result.ok && result.value.outputVerification === 'passed' && result.value.output?.created === true && result.value.output.artifact) {
        verifiedArtifacts.current.get(fileId)?.dispose()
        verifiedArtifacts.current.set(fileId, result.value.output.artifact)
        const { output: _output, ...resultMetadata } = result.value
        setRemoval({ fileId, status: 'success', result: resultMetadata })
      } else {
        if (result.ok) result.value.output?.artifact.dispose()
        setRemoval({ fileId, status: 'failed', error: { code: 'VERIFICATION_FAILED', message: 'Local removal did not pass independent verification.' } })
      }
    })
  }
  async function downloadVerifiedRemoval(fileId: string): Promise<BoundaryResult<void>> {
    const current = removal
    if (!current || current.fileId !== fileId || current.status !== 'success' || current.result.outputVerification !== 'passed' || !current.result.output?.created) return { ok: false, error: { code: 'INVALID_INPUT', message: 'No verified output is available.' } }
    const artifact = verifiedArtifacts.current.get(fileId)
    if (!artifact) return { ok: false, error: { code: 'INVALID_INPUT', message: 'No verified output is available.' } }
    const bytes = await artifact.read()
    if (!bytes.ok) return { ok: false, error: { code: bytes.error.code, message: 'The verified output could not be read.' } }
    let url: string | undefined
    let anchor: HTMLAnchorElement | undefined
    try {
      const blob = new Blob([bytes.value], { type: artifact.mediaType || 'image/jpeg' })
      url = URL.createObjectURL(blob)
      anchor = document.createElement('a')
      anchor.href = url
      anchor.download = artifact.filename
      anchor.click()
      anchor.remove()
      return { ok: true, value: undefined }
    } catch {
      anchor?.remove()
      return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'The local download could not be completed.' } }
    } finally {
      if (url) URL.revokeObjectURL(url)
    }
  }
  function scan() {
    if (scanTimer.current) clearTimeout(scanTimer.current)
    setScanning(true)
    scanTimer.current = setTimeout(() => setScanning(false), 1200)
  }
  function loadDemo(batch = false) {
    if (running.current) return
    const additions: DemoFile[] = batch ? [sampleFile,
      { id: 'portrait-demo', name: 'portrait_studio.jpg', format: 'JPEG', size: '3.2 MB', kind: 'image', state: 'ready', demo: true },
      { id: 'video-demo', name: 'mountain_walk.mp4', format: 'MP4', size: '24.6 MB', kind: 'video', state: 'ready', demo: true },
      { id: 'error-demo', name: 'incomplete_image.webp', format: 'WEBP', size: '820 KB', kind: 'image', state: 'error', demo: true },
      { id: 'raw-demo', name: 'camera_original.arw', format: 'ARW', size: '48 MB', kind: 'image', state: 'unsupported', demo: true },
    ] : [sampleFile]
    setFiles(old => [...old.filter(f => !additions.some(a => a.id === f.id)), ...additions])
    selectFile(sampleFile.id)
    scan()
    router.push('/inspect')
    toast.info(batch ? 'Demo batch loaded. Includes partial, error, and unsupported scenarios.' : 'Sample loaded. All findings are simulated.')
  }
  function addFiles(incoming: FileList | File[]) {
    if (running.current) { toast.info('Wait for the current demo run to finish.'); return }
    const additions: DemoFile[] = Array.from(incoming).slice(0, 30).map(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const supported = ['jpg','jpeg','png','webp','gif','heic','mp4','mov','webm','mp3','wav','m4a','pdf','docx'].includes(ext)
      const id = crypto.randomUUID()
      localInputs.current.set(id, createBrowserFileInput(file))
      return { id, name: file.name, format: ext.toUpperCase() || 'Unknown', size: file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`, kind: ['mp4','mov','webm'].includes(ext) ? 'video' : ['mp3','wav','m4a'].includes(ext) ? 'audio' : ['pdf','docx'].includes(ext) ? 'document' : 'image', state: supported ? 'ready' : 'unsupported', demo: false }
    })
    if (!additions.length) return
    setFiles(old => {
      const next = [...old, ...additions].slice(-30)
      const retained = new Set(next.map(file => file.id))
      for (const [id, input] of localInputs.current) if (!retained.has(id)) { input.release(); localInputs.current.delete(id) }
      return next
    })
    selectFile(additions[0].id)
    scan()
    router.push('/inspect')
    toast.info('File names added locally. Contents are not read; all analysis is demo data.')
  }
  function clearSession() {
    animation.current?.kill()
    if (scanTimer.current) clearTimeout(scanTimer.current)
    running.current = false
    inspectionAbort.current?.abort()
    removalAbort.current?.abort()
    for (const artifact of verifiedArtifacts.current.values()) artifact.dispose()
    verifiedArtifacts.current.clear()
    for (const input of localInputs.current.values()) input.release()
    localInputs.current.clear()
    setInspection(undefined)
    setRemoval(undefined)
    setFiles([]); setReports([]); selectFile(''); setAllDrafts({}); setBusy(false); setScanning(false); setProgress(0)
    toast.success('Session cleared. No source files were changed.')
  }
  function run(policy: string, removed: string[], edits: Record<string, string> = {}, batch = false) {
    if (running.current || !selected) return
    const targets = (batch ? files : [selected]).filter(f => !['error', 'unsupported'].includes(f.state))
    if (!targets.length) { toast.error('No supported files are ready.'); return }
    running.current = true
    setBusy(true); setProgress(0)
    setFiles(old => old.map(f => targets.some(t => t.id === f.id) ? { ...f, state: 'processing' } : f))
    const counter = { value: 0 }
    animation.current = gsap.to(counter, { value: 100, duration: 3.8, ease: 'none', onUpdate: () => setProgress(counter.value), onComplete: () => {
      const generated: DemoReport[] = []
      setFiles(old => old.map(f => {
        if (!targets.some(t => t.id === f.id)) return f
        return { ...f, state: scenario === 'error' ? 'error' : scenario === 'partial' || (batch && f.kind === 'video') ? 'partial' : 'success' }
      }))
      if (scenario !== 'error') {
        for (const file of targets) {
          const changes = metadata.map(m => {
            const canChange = ['Safe to remove', 'Editable'].includes(m.capability)
            if (canChange && removed.includes(m.id)) return { label: m.label, before: m.value, after: 'Removed', action: 'Removed' as const }
            if (m.capability === 'Editable' && edits[m.id] !== undefined && edits[m.id] !== m.value) return { label: m.label, before: m.value, after: edits[m.id] || '(empty)', action: 'Edited' as const }
            return { label: m.label, before: m.value, after: m.value, action: 'Preserved' as const }
          })
          const removedCount = changes.filter(c => c.action === 'Removed').length
          const editedCount = changes.filter(c => c.action === 'Edited').length
          generated.push({ id: crypto.randomUUID(), fileId: file.id, filename: file.name, format: file.format, kind: file.kind, createdAt: new Date().toISOString(), policy, removed: removedCount, edited: editedCount, preserved: 18 - removedCount - editedCount, risk: Math.max(18, 82 - removedCount * 9 - editedCount * 3 - (removedCount ? 1 : 0)), changes, partial: scenario === 'partial' || (batch && file.kind === 'video') })
        }
        setReports(old => [...generated, ...old])
        toast.success('Demo complete. Simulated verification results are ready.')
      } else toast.error('Simulated processing error. Your original is untouched. Try the retry action.')
      running.current = false; setBusy(false)
    } })
  }
  return <Prototype.Provider value={{ files, selected, selectFile, addFiles, loadDemo, reports, currentReport: reports.find(r => r.fileId === selectedId), progress, busy, scanning, scenario, setScenario, run, clearSession, inspection, removal, planRealRemoval, setRemovalTargets, approveAndProcessRemoval, downloadVerifiedRemoval,
    drafts: allDrafts[selectedId] || {}, setDraft: (key, value) => setAllDrafts(old => ({ ...old, [selectedId]: { ...old[selectedId], [key]: value } })),
    removeFile: id => { if (running.current) return; if (selectedId === id) inspectionAbort.current?.abort(); removalAbort.current?.abort(); verifiedArtifacts.current.get(id)?.dispose(); verifiedArtifacts.current.delete(id); localInputs.current.get(id)?.release(); localInputs.current.delete(id); if (inspection?.fileId === id) setInspection(undefined); if (removal?.fileId === id) setRemoval(undefined); setFiles(old => old.filter(f => f.id !== id)); if (selectedId === id) selectFile(files.find(f => f.id !== id)?.id || '') },
    retryFile: id => { setScenario('normal'); setFiles(old => old.map(f => f.id === id ? { ...f, state: 'ready' } : f)); toast.info('Demo reset. You can run the workflow again.') },
  }}><TooltipProvider delay={300}>{children}<Toaster theme="dark" position="bottom-right" closeButton /></TooltipProvider></Prototype.Provider>
}
