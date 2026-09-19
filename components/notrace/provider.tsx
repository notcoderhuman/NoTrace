'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import gsap from 'gsap'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { metadata, sampleFile, type DemoFile, type DemoReport } from '@/lib/notrace-demo'
import { createBrowserFileInput, DEFAULT_BROWSER_INPUT_MAX_BYTES } from '@/lib/local-boundary/browser-input'
import { createDefaultFormatAdapterRegistry } from '@/lib/local-boundary/default-registry'
import { createInspectionBoundary } from '@/lib/local-boundary/inspection-boundary'
import { createPlanningBoundary } from '@/lib/local-boundary/planning-boundary'
import { createProcessingBoundary } from '@/lib/local-boundary/processing-boundary'
import type { LocalInput } from '@/lib/processing-core/domain/input'
import type { InspectionResult } from '@/lib/processing-core/domain/metadata'
import type { BoundaryError } from '@/lib/processing-core/domain/result'
import type { LocalProcessingBoundary } from '@/lib/processing-core/domain/boundary'
import { disposeArtifact, type OutputArtifact } from '@/lib/processing-core/domain/artifact'
import { releaseLocalInput, transitionOwnedArtifact, type OwnedArtifact } from '@/lib/processing-core/domain/ownership'
import { sameProcessingIdentity } from '@/lib/processing-core/domain/identity'
import type { ProcessingResult, RemovalApproval, RemovalPlan } from '@/lib/processing-core/domain/operation'
import type { BoundaryResult, VerificationResult } from '@/lib/processing-core/domain/result'
import { mapDemoProgress, mapDemoReport, mapDemoRisk, mapDemoVerification } from '@/lib/presentation/demo-mapper'
import { mapRealInspection, mapRealProgress, mapRealRemoval, mapRealReport, mapRealRisk, mapRealVerification, type SafeProcessingProjection } from '@/lib/presentation/real-mapper'
import { snapshotReport, upsertReportSnapshot } from '@/lib/presentation/report-history'
import { mapDemoFile } from '@/lib/presentation/demo-mapper'
import type { ReportViewModel, RemovalViewModel, RiskAssessmentViewModel, ProgressViewModel, UnifiedFileViewModel, VerificationViewModel } from '@/lib/presentation/models'
import { mapRealFile } from '@/lib/presentation/real-mapper'

type InspectionState =
  | { fileId: string; status: 'inspecting' }
  | { fileId: string; status: 'success' | 'partial'; result: InspectionResult }
  | { fileId: string; status: 'unsupported' | 'failed' | 'cancelled'; error: BoundaryError }

type VerifiedOutputMetadata = Readonly<{ filename: string; created: true }>
type VerifiedProcessingResult = Omit<ProcessingResult, 'output'> & { output: VerifiedOutputMetadata; providerOwned: true }
type ProcessingPresentationState = Readonly<{ result?: SafeProcessingProjection; verification?: VerificationResult }>
type RemovalState =
  | { fileId: string; status: 'idle' | 'planning' }
  | { fileId: string; status: 'ready' | 'ready-empty' | 'approval-pending'; plan: RemovalPlan; selectedTargetIds: readonly string[] }
  | { fileId: string; status: 'processing'; plan: RemovalPlan; selectedTargetIds: readonly string[] }
  | { fileId: string; status: 'success'; plan: RemovalPlan; selectedTargetIds: readonly string[]; result: VerifiedProcessingResult }
  | { fileId: string; status: 'unsupported'; error: BoundaryError }
  | { fileId: string; status: 'failed' | 'cancelled'; plan?: RemovalPlan; selectedTargetIds?: readonly string[]; error: BoundaryError }

export type RemovalOperation = Readonly<{ fileId: string; inputId: string; generation: number; controller: AbortController; signal: AbortSignal }>
export type RemovalLifecycleController = Readonly<{
  begin(fileId: string, inputId: string): RemovalOperation
  invalidate(): void
  isCurrent(operation: RemovalOperation, fileId: string, inputId: string): boolean
  currentGeneration(): number
}>

export type RemovalCompletion = Readonly<{ kind: 'stale' | 'failed' | 'success'; artifact?: OutputArtifact }>

function expectedPreservedTargetIds(plan: RemovalPlan, approvedTargetIds: readonly string[]): readonly string[] {
  return Array.isArray(plan.targets) ? plan.targets.filter(target => !approvedTargetIds.includes(target.id)).map(target => target.id) : plan.preservedTargetIds
}

export function exactIdSet(actual: readonly string[], expected: readonly string[]): boolean {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  return actual.length === actualSet.size && expected.length === expectedSet.size && actualSet.size === expectedSet.size && actual.every(id => expectedSet.has(id)) && expected.every(id => actualSet.has(id))
}

function sameWitness(a: any, b: any): boolean {
  return Boolean(a && b && typeof a.sourceFingerprint === 'string' && typeof a.targetId === 'string' && Number.isSafeInteger(a.ordinal) && Number.isSafeInteger(a.startOffset) && Number.isSafeInteger(a.endOffset) && Number.isSafeInteger(a.marker) && Number.isSafeInteger(a.rangeLength) && a.sourceFingerprint === b.sourceFingerprint && a.targetId === b.targetId && a.ordinal === b.ordinal && a.startOffset === b.startOffset && a.endOffset === b.endOffset && a.marker === b.marker && a.rangeLength === b.rangeLength)
}

export function exactWitnessSet(actual: readonly unknown[], expected: readonly unknown[]): boolean {
  if (actual.length !== expected.length) return false
  const matched = new Set<number>()
  for (const witness of actual) {
    const candidates = expected.map((candidate, index) => sameWitness(witness, candidate) && !matched.has(index) ? index : -1).filter(index => index >= 0)
    if (candidates.length !== 1) return false
    matched.add(candidates[0])
  }
  return matched.size === expected.length
}

export function settleRemovalCompletion(args: {
  lifecycle: RemovalLifecycleController; ownership: ArtifactOwnershipController; operation: RemovalOperation
  fileId: string; inputId: string; requestId: number; selectedId: string | undefined
  currentInput: unknown; expectedInput: unknown; expectedPlan: RemovalPlan; expectedApproval: RemovalApproval; result: BoundaryResult<ProcessingResult>
}): RemovalCompletion {
  const current = args.lifecycle.isCurrent(args.operation, args.fileId, args.inputId) && !args.operation.signal.aborted && args.requestId === args.lifecycle.currentGeneration() && args.selectedId === args.fileId && args.currentInput === args.expectedInput
  if (!current) { disposeObservedArtifacts(args.result); return { kind: 'stale' } }
  // EXACTLY ONE SUCCESS PATH. A result that does not satisfy the strict gate below is a failure:
  // it is never adopted, never published, and its observable artifacts are disposed.
  if (args.result.ok && args.result.value.status === 'success' && args.result.value.outputVerification === 'passed' && args.result.value.verification?.status === 'success' && sameProcessingIdentity(args.result.value.identity, args.result.value.verification.identity) && args.result.value.verification.outputCreated === true && args.result.value.verification.output === args.result.value.output?.artifact && args.result.value.output?.created === true && args.result.value.output.artifact && args.result.value.verification.inputId === args.inputId && args.result.value.verification.inputId === args.expectedPlan.input.id && args.result.value.verification.planId === args.expectedPlan.id && args.result.value.verification.sourceFingerprint === args.expectedPlan.sourceFingerprint && sameProcessingIdentity(args.result.value.identity, args.expectedPlan.identity) && sameProcessingIdentity(args.result.value.verification.identity, args.expectedApproval.identity) && args.result.value.verification.inputId === args.expectedApproval.inputId && args.result.value.verification.sourceFingerprint === args.expectedApproval.sourceFingerprint && JSON.stringify(args.result.value.verification.approvedTargetIds) === JSON.stringify(args.expectedApproval.approvedTargetIds) && exactIdSet(args.result.value.verification.approvedTargetIds, args.expectedApproval.approvedTargetIds) && exactIdSet(args.result.value.verification.removedTargetIds, args.expectedApproval.approvedTargetIds) && exactIdSet(args.result.value.verification.preservedTargetIds, expectedPreservedTargetIds(args.expectedPlan, args.expectedApproval.approvedTargetIds)) && exactWitnessSet(args.result.value.verification.removalTrace, args.expectedPlan.removalWitnesses.filter(witness => args.expectedApproval.approvedTargetIds.includes(witness.targetId))) && args.result.value.verificationCheckIds !== undefined && args.result.value.verificationCheckIds.length > 0 && exactIdSet(args.result.value.verification.checks.map((check: any) => check.id), args.result.value.verificationCheckIds) && args.result.value.verification.checks.every((check: any) => check.status === 'passed') && args.result.value.identity && args.result.value.verification.identity && args.result.value.verification.sourceFingerprint) { const artifact = args.result.value.output.artifact; const adopted = args.ownership.adopt(args.fileId, artifact, 'EXECUTION_OWNED', args.result.value.identity); if (!adopted.ok) { if (args.ownership.get(args.fileId) !== artifact) disposeArtifact(artifact); return { kind: 'failed' } } return { kind: 'success', artifact } }
  disposeObservedArtifacts(args.result)
  return { kind: 'failed' }
}

export function createRemovalLifecycleController(): RemovalLifecycleController {
  let generation = 0
  let current: RemovalOperation | undefined
  return {
    begin(fileId, inputId) {
      current?.controller.abort()
      const controller = new AbortController()
      current = { fileId, inputId, generation: ++generation, controller, signal: controller.signal }
      return current
    },
    invalidate() { current?.controller.abort(); current = undefined; generation += 1 },
    isCurrent(operation, fileId, inputId) { return current === operation && !operation.signal.aborted && operation.fileId === fileId && operation.inputId === inputId && operation.generation === generation },
    currentGeneration() { return generation },
  }
}

function observedArtifacts(value: unknown): OutputArtifact[] {
  const found: OutputArtifact[] = []
  const visit = (candidate: unknown, depth: number) => {
    if (!candidate || depth > 3 || typeof candidate !== 'object') return
    const object = candidate as Record<string, unknown>
    const artifact = object.artifact as OutputArtifact | undefined
    if (artifact && typeof artifact.dispose === 'function' && !found.includes(artifact)) found.push(artifact)
    for (const key of ['value', 'error', 'output']) visit(object[key], depth + 1)
  }
  visit(value, 0)
  return found
}
function disposeObservedArtifacts(value: unknown): void { for (const artifact of observedArtifacts(value)) disposeArtifact(artifact) }

export type ArtifactOwnershipController = Readonly<{
  adopt(fileId: string, artifact: OutputArtifact, state?: 'EXECUTION_OWNED' | 'VERIFIED', identity?: ProcessingResult['identity']): BoundaryResult<void>
  remove(fileId: string): void
  clear(): void
  get(fileId: string): OutputArtifact | undefined
  has(fileId: string): boolean
  size(): number
  acquireDownloadLease(fileId: string, artifact: OutputArtifact): BoundaryResult<void>
  releaseDownloadLease(fileId: string, artifact: OutputArtifact): BoundaryResult<void>
}>

export function createArtifactOwnershipController(artifacts = new Map<string, OutputArtifact>()): ArtifactOwnershipController {
  const owners = new Map<OutputArtifact, string>()
  const entries = new Map<string, { artifact: OutputArtifact; state: 'PROVIDER_OWNED'; identity?: ProcessingResult['identity'] }>()
  const disposed = new Set<OutputArtifact>()
  const downloadLeases = new Map<OutputArtifact, number>()
  const pendingDisposals = new Set<OutputArtifact>()
  for (const [fileId, artifact] of artifacts) { if (owners.has(artifact)) { artifacts.delete(fileId); continue } owners.set(artifact, fileId); entries.set(fileId, { artifact, state: 'PROVIDER_OWNED' }) }
  const disposeOwned = (artifact: OutputArtifact | undefined) => {
    if (!artifact || disposed.has(artifact)) return
    if ((downloadLeases.get(artifact) || 0) > 0) { pendingDisposals.add(artifact); return }
    disposed.add(artifact)
    disposeArtifact(artifact)
  }
  return {
    adopt(fileId, artifact, state = 'EXECUTION_OWNED', identity) {
      if (state !== 'EXECUTION_OWNED' || !identity || disposed.has(artifact)) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Only a live execution-owned artifact may be adopted.' } }
      const existingOwner = owners.get(artifact)
      if (existingOwner && existingOwner !== fileId) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Artifact is already owned by another file.' } }
      const tracked = entries.get(fileId)
      if (tracked?.artifact === artifact) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Artifact is already provider-owned.' } }
      const verified = transitionOwnedArtifact({ artifact, state: 'EXECUTION_OWNED' } satisfies OwnedArtifact, 'VERIFIED')
      if (!verified.ok) return verified
      const transfer = transitionOwnedArtifact(verified.value, 'TRANSFERRED')
      if (!transfer.ok) return transfer
      const providerOwned = transitionOwnedArtifact(transfer.value, 'PROVIDER_OWNED')
      if (!providerOwned.ok) return providerOwned
      const previous = entries.get(fileId)?.artifact
      if (previous && previous !== artifact) { entries.delete(fileId); owners.delete(previous); artifacts.delete(fileId); disposeOwned(previous) }
      entries.set(fileId, { artifact, state: 'PROVIDER_OWNED', identity }); artifacts.set(fileId, artifact); owners.set(artifact, fileId)
      return { ok: true, value: undefined }
    },
    remove(fileId) { const artifact = entries.get(fileId)?.artifact; entries.delete(fileId); artifacts.delete(fileId); if (artifact) owners.delete(artifact); disposeOwned(artifact) },
    clear() { for (const entry of entries.values()) { owners.delete(entry.artifact); disposeOwned(entry.artifact) } entries.clear(); artifacts.clear(); owners.clear() },
    get(fileId) { return artifacts.get(fileId) },
    has(fileId) { return artifacts.has(fileId) },
    size() { return artifacts.size }, acquireDownloadLease(fileId, artifact) { if (disposed.has(artifact) || artifacts.get(fileId) !== artifact || entries.get(fileId)?.artifact !== artifact) return { ok: false, error: { code: 'INVALID_INPUT', message: 'A currently provider-owned verified artifact is required.' } }; downloadLeases.set(artifact, (downloadLeases.get(artifact) || 0) + 1); return { ok: true, value: undefined } }, releaseDownloadLease(fileId, artifact) { const count = downloadLeases.get(artifact) || 0; if ((artifacts.get(fileId) !== artifact && !pendingDisposals.has(artifact)) || count <= 0) return { ok: false, error: { code: 'INVALID_INPUT', message: 'The download lease is not active.' } }; if (count === 1) downloadLeases.delete(artifact); else downloadLeases.set(artifact, count - 1); if (!downloadLeases.has(artifact) && pendingDisposals.has(artifact)) { pendingDisposals.delete(artifact); disposed.add(artifact); disposeArtifact(artifact) }; return { ok: true, value: undefined } },
  }
}

export function disposeOwnedArtifact(artifacts: Map<string, OutputArtifact>, fileId: string): void {
  const controller = createArtifactOwnershipController(artifacts)
  controller.remove(fileId)
}

export function disposeOwnedArtifacts(artifacts: Map<string, OutputArtifact>): void {
  createArtifactOwnershipController(artifacts).clear()
}

type PrototypeContext = {
  files: DemoFile[]; selected: DemoFile | undefined; previewUrl: string | undefined; previewError: boolean; setPreviewError: (value: boolean) => void; selectFile: (id: string) => void;
  addFiles: (files: FileList | File[]) => void; loadDemo: (batch?: boolean) => void;
  removeFile: (id: string) => void; clearSession: () => void; retryFile: (id: string) => void;
  reports: DemoReport[]; currentReport: DemoReport | undefined; realReports: readonly ReportViewModel[];
  presentationFiles: readonly UnifiedFileViewModel[]; currentFilePresentation: UnifiedFileViewModel | undefined; currentRiskAssessment: RiskAssessmentViewModel; currentProgress: ProgressViewModel; currentRemovalPresentation: RemovalViewModel | undefined; currentVerification: VerificationViewModel; currentReportPresentation: ReportViewModel | undefined;
  run: (policy: string, removed: string[], edits?: Record<string, string>, batch?: boolean) => void;
  progress: number; busy: boolean; scanning: boolean; scenario: string; setScenario: (value: string) => void;
  drafts: Record<string, string>; setDraft: (key: string, value: string) => void;
  inspection: InspectionState | undefined;
  retryInspection: (fileId: string) => void;
  cancelInspection: (fileId: string) => void;
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
  const [selectedId, setSelectedId] = useState('')
  const [reports, setReports] = useState<DemoReport[]>([])
  const [realReports, setRealReports] = useState<readonly ReportViewModel[]>([])
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scenario, setScenario] = useState('normal')
  const [allDrafts, setAllDrafts] = useState<Record<string, Record<string, string>>>({})
  const [inspection, setInspection] = useState<InspectionState>()
  const [removal, setRemoval] = useState<RemovalState>()
  const localInputs = useRef(new Map<string, LocalInput>())
  const localFiles = useRef(new Map<string, File>())
  const previewUrlRef = useRef<string | undefined>(undefined)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined)
  const [previewError, setPreviewError] = useState(false)
  const verifiedArtifacts = useRef(new Map<string, OutputArtifact>())
  const artifactOwnership = useRef(createArtifactOwnershipController(verifiedArtifacts.current))
  const inspectionBoundary = useRef<LocalProcessingBoundary | null>(null)
  const planningBoundary = useRef<LocalProcessingBoundary | null>(null)
  const processingBoundary = useRef<LocalProcessingBoundary | null>(null)
  const inspectionAbort = useRef<AbortController | null>(null)
  const removalAbort = useRef<AbortController | null>(null)
  const removalRequest = useRef(0)
  const removalLifecycle = useRef(createRemovalLifecycleController())
  const registry = useRef(createDefaultFormatAdapterRegistry())
  if (!inspectionBoundary.current) inspectionBoundary.current = createInspectionBoundary(registry.current)
  if (!planningBoundary.current) planningBoundary.current = createPlanningBoundary(registry.current)
  if (!processingBoundary.current) processingBoundary.current = createProcessingBoundary(registry.current)
  const animation = useRef<gsap.core.Tween | null>(null)
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const running = useRef(false)
  const selected = files.find(file => file.id === selectedId)
  const selectFile = (id: string) => { removalLifecycle.current.invalidate(); removalAbort.current?.abort(); removalRequest.current += 1; if (id !== selectedId) { inspectionAbort.current?.abort(); setInspection(undefined); setRemoval(undefined) } setSelectedId(id) }
  useEffect(() => () => {
    animation.current?.kill()
    if (scanTimer.current) clearTimeout(scanTimer.current)
    inspectionAbort.current?.abort()
    removalLifecycle.current.invalidate()
    removalAbort.current?.abort()
    artifactOwnership.current.clear()
    for (const input of localInputs.current.values()) releaseLocalInput(input)
    localInputs.current.clear()
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = undefined
  }, [])
  useEffect(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = undefined
    setPreviewUrl(undefined)
    setPreviewError(false)
    const file = selectedId ? localFiles.current.get(selectedId) : undefined
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreviewUrl(url)
    return () => { if (previewUrlRef.current === url) { URL.revokeObjectURL(url); previewUrlRef.current = undefined } }
  }, [selectedId])
  function inspectRealFile(fileId: string) {
    const input = localInputs.current.get(fileId)
    if (!input || fileId !== selectedId) return
    inspectionAbort.current?.abort()
    const controller = new AbortController()
    inspectionAbort.current = controller
    setInspection({ fileId, status: 'inspecting' })
    void inspectionBoundary.current!.inspect(input, { signal: controller.signal }).then(result => {
      if (selectedId !== fileId || localInputs.current.get(fileId) !== input) return
      if (result.ok) setInspection({ fileId, status: result.value.status === 'partial' ? 'partial' : 'success', result: result.value })
      else setInspection({ fileId, status: result.error.code === 'CANCELLED' ? 'cancelled' : result.error.code === 'UNSUPPORTED' ? 'unsupported' : 'failed', error: result.error })
    }).catch(() => {
      if (selectedId === fileId && localInputs.current.get(fileId) === input) setInspection({ fileId, status: 'failed', error: { code: 'PROCESSING_FAILED', message: 'Local inspection could not be completed.' } })
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
    const operation = removalLifecycle.current.begin(fileId, input.descriptor.id)
    const requestId = operation.generation
    const controller = operation.controller
    removalRequest.current = requestId
    removalAbort.current = controller
    setRemoval({ fileId, status: 'planning' })
    void (async () => {
      let result = await planningBoundary.current!.planRemoval({ input, fieldIds: [], policy: input.descriptor.mimeType === 'image/png' ? 'png-text' : 'jpeg-com' }, { signal: controller.signal })
      if (result.ok && result.value.removableTargetIds.length === 0) {
        const targetIds = result.value.targets
          .filter(target => target.removable && target.classification === 'SAFE_TO_REMOVE')
          .map(target => target.id)
        if (targetIds.length) result = await planningBoundary.current!.planRemoval({ input, fieldIds: targetIds, policy: input.descriptor.mimeType === 'image/png' ? 'png-text' : 'jpeg-com' }, { signal: controller.signal })
      }
      if (!removalLifecycle.current.isCurrent(operation, fileId, input.descriptor.id) || controller.signal.aborted || requestId !== removalRequest.current || selectedId !== fileId || localInputs.current.get(fileId) !== input) return
      if (result.ok) setRemoval({ fileId, status: result.value.status === 'ready' ? (result.value.removableTargetIds.length ? 'ready' : 'ready-empty') : 'idle', plan: result.value, selectedTargetIds: [] } as RemovalState)
      else setRemoval({ fileId, status: result.error.code === 'UNSUPPORTED' ? 'unsupported' : 'failed', error: result.error })
    })().catch(() => {
      if (!controller.signal.aborted && removalLifecycle.current.isCurrent(operation, fileId, input.descriptor.id) && selectedId === fileId && localInputs.current.get(fileId) === input) setRemoval({ fileId, status: 'failed', error: { code: 'PROCESSING_FAILED', message: 'Local removal planning could not be completed.' } })
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
    const operation = removalLifecycle.current.begin(fileId, input.descriptor.id)
    const requestId = operation.generation
    const controller = operation.controller
    removalRequest.current = requestId
    removalAbort.current = controller
    const approval: RemovalApproval = { planId: current.plan.id, inputId: input.descriptor.id, sourceFingerprint: current.plan.sourceFingerprint, identity: current.plan.identity, approvedTargetIds: targetIds, approvedAt: Date.now() }
    setRemoval({ fileId, status: 'processing', plan: current.plan, selectedTargetIds: targetIds })
    void processingBoundary.current!.execute({ operation: 'remove', input, plan: current.plan, approval }, { signal: controller.signal }).then(result => {
      const completion = settleRemovalCompletion({ lifecycle: removalLifecycle.current, ownership: artifactOwnership.current, operation, fileId, inputId: input.descriptor.id, requestId, selectedId, currentInput: localInputs.current.get(fileId), expectedInput: input, expectedPlan: current.plan, expectedApproval: approval, result })
      if (completion.kind === 'stale') return
      if (completion.kind === 'success' && completion.artifact && result.ok && result.value.output) {
        const { output, ...resultMetadata } = result.value
        setRemoval({ fileId, status: 'success', plan: current.plan, selectedTargetIds: targetIds, result: { ...resultMetadata, output: { filename: output.filename, created: true }, providerOwned: true } })
      } else setRemoval({ fileId, status: 'failed', plan: current.plan, selectedTargetIds: targetIds, error: { code: result.ok ? 'VERIFICATION_FAILED' : result.error.code, message: result.ok ? 'Local removal did not pass independent verification.' : result.error.message } })
    }).catch(() => {
      if (removalLifecycle.current.isCurrent(operation, fileId, input.descriptor.id) && !controller.signal.aborted && requestId === removalRequest.current && selectedId === fileId && localInputs.current.get(fileId) === input) setRemoval({ fileId, status: 'failed', error: { code: 'PROCESSING_FAILED', message: 'Local removal could not be completed.' } })
    })
  }
  async function downloadVerifiedRemoval(fileId: string): Promise<BoundaryResult<void>> {
    const current = removal
    if (!current || current.fileId !== fileId || current.status !== 'success' || current.result.outputVerification !== 'passed' || !current.result.output?.created) return { ok: false, error: { code: 'INVALID_INPUT', message: 'No verified output is available.' } }
    const artifact = verifiedArtifacts.current.get(fileId)
    if (!artifact) return { ok: false, error: { code: 'INVALID_INPUT', message: 'No verified output is available.' } }
    const lease = artifactOwnership.current.acquireDownloadLease(fileId, artifact)
    if (!lease.ok) return lease
    let leaseReleased = false
    const releaseLease = () => { if (!leaseReleased) { leaseReleased = true; artifactOwnership.current.releaseDownloadLease(fileId, artifact) } }
    let url: string | undefined
    let bytes: BoundaryResult<Uint8Array>
    try { bytes = await artifact.read() } catch { releaseLease(); return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'The verified output could not be read.' } } }
    if (!bytes.ok) { releaseLease(); return { ok: false, error: { code: bytes.error.code, message: 'The verified output could not be read.' } } }
    let anchor: HTMLAnchorElement | undefined
    try {
      if (!artifact.mediaType) return { ok: false, error: { code: 'VERIFICATION_FAILED', message: 'Verified artifact media type is missing.' } }
      const blob = new Blob([bytes.value], { type: artifact.mediaType })
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
      releaseLease()
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
    const incomingFiles = Array.from(incoming)
    if (running.current) { toast.info('Wait for the current demo run to finish.'); return }
    if (!incomingFiles.length) return
    const additions: DemoFile[] = incomingFiles.slice(0, 30).map(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const supported = ['jpg', 'jpeg', 'png'].includes(ext) && file.size <= DEFAULT_BROWSER_INPUT_MAX_BYTES
      const id = crypto.randomUUID()
      localInputs.current.set(id, createBrowserFileInput(file))
      localFiles.current.set(id, file)
      return { id, name: file.name, format: ext.toUpperCase() || 'Unknown', size: file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`, kind: 'image', state: supported ? 'ready' : 'unsupported', demo: false }
    })
    if (!additions.length) return
    const rejected = Array.from(incoming).slice(0, 30).filter(file => !['jpg', 'jpeg', 'png'].includes(file.name.split('.').pop()?.toLowerCase() || '') || file.size > DEFAULT_BROWSER_INPUT_MAX_BYTES)
    if (rejected.length) toast.error(`${rejected.length} file${rejected.length === 1 ? '' : 's'} rejected. Only supported JPEG or PNG files up to 32 MB are accepted.`)
    setFiles(old => {
      const next = [...old, ...additions].slice(-30)
      const retained = new Set(next.map(file => file.id))
      for (const [id, input] of localInputs.current) if (!retained.has(id)) { releaseLocalInput(input); localInputs.current.delete(id); localFiles.current.delete(id) }
      return next
    })
    selectFile(additions[0].id)
    scan()
    router.push('/inspect')
    toast.info('File added locally. Real inspection runs on this device.')
  }
  function retryInspection(fileId: string) {
    if (selectedId !== fileId || !localInputs.current.has(fileId)) return
    setInspection({ fileId, status: 'inspecting' })
    inspectRealFile(fileId)
  }
  function cancelInspection(fileId: string) {
    if (selectedId !== fileId || inspection?.fileId !== fileId || inspection.status !== 'inspecting') return
    inspectionAbort.current?.abort()
    setInspection({ fileId, status: 'cancelled', error: { code: 'CANCELLED', message: 'Inspection was cancelled.' } })
  }
  function clearSession() {
    animation.current?.kill()
    if (scanTimer.current) clearTimeout(scanTimer.current)
    running.current = false
    inspectionAbort.current?.abort()
    removalLifecycle.current.invalidate()
    removalAbort.current?.abort()
    artifactOwnership.current.clear()
    for (const input of localInputs.current.values()) releaseLocalInput(input)
    localInputs.current.clear()
    localFiles.current.clear()
    setInspection(undefined)
    setRemoval(undefined)
    setFiles([]); setReports([]); setRealReports([]); selectFile(''); setAllDrafts({}); setBusy(false); setScanning(false); setProgress(0)
    toast.success('Session cleared. No source files were changed.')
  }
  function run(policy: string, removed: string[], edits: Record<string, string> = {}, batch = false) {
    if (running.current || !selected || !selected.demo) return
    const targets = (batch ? files : [selected]).filter(f => f.demo && !['error', 'unsupported'].includes(f.state))
    if (!targets.length || targets.some(file => !file.demo)) return
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
  const currentReport = reports.find(r => r.fileId === selectedId)
  const presentationFiles = files.map(file => file.demo ? mapDemoFile(file) : mapRealFile({ id: file.id, filename: file.name, size: localFiles.current.get(file.id)?.size }, inspection && inspection.fileId === file.id && 'result' in inspection ? inspection.result : undefined))
  const currentFilePresentation = presentationFiles.find(file => file.id === selectedId)
  const currentRiskAssessment = selected?.demo && currentReport ? mapDemoRisk({ risk: currentReport.risk, partial: currentReport.partial }) : mapRealRisk(inspection && inspection.fileId === selectedId && 'result' in inspection ? inspection.result : undefined)
  const currentProgress = selected?.demo ? mapDemoProgress(busy ? 'processing' : scanning ? 'inspecting' : 'idle', progress) : mapRealProgress(removal?.status === 'processing' ? 'processing' : inspection?.status === 'inspecting' ? 'inspecting' : 'idle')
  const failedPlan = removal && 'plan' in removal ? removal.plan : undefined
  const removalProjection = removal?.status === 'failed' && failedPlan ? { status: 'failed' as const, outputVerification: 'not-run' as const, removedTargetIds: [], preservedTargetIds: failedPlan.preservedTargetIds, warnings: [removal.error.message] } : removal?.status === 'cancelled' && failedPlan ? { status: 'failed' as const, outputVerification: 'not-run' as const, removedTargetIds: [], preservedTargetIds: failedPlan.preservedTargetIds, warnings: [removal.error.message] } : removal?.status === 'success' ? removal.result : undefined
  const currentRemovalPresentation = removal && 'plan' in removal && removal.plan ? mapRealRemoval(removal.plan, removal.selectedTargetIds || [], removalProjection) : undefined
  const currentVerification = selected?.demo ? mapDemoVerification(Boolean(currentReport?.partial)) : removal?.status === 'success' ? mapRealVerification(removal.result.verification, { sourceFingerprint: removal.plan.sourceFingerprint, identity: removal.plan.identity }) : mapRealVerification()
  const realInspection = inspection && inspection.fileId === selectedId && 'result' in inspection ? inspection.result : undefined
  const realFindings = realInspection ? mapRealInspection(realInspection).findings : []
  const currentReportPresentation = selected?.demo && currentReport ? mapDemoReport(currentReport) : selected && !selected.demo && realInspection ? mapRealReport({ id: selected.id, filename: selected.name, format: selected.format, size: localFiles.current.get(selected.id)?.size }, realFindings, currentRemovalPresentation, currentVerification) : undefined
  useEffect(() => {
    if (!currentReportPresentation) return
    setRealReports(previous => upsertReportSnapshot(previous, currentReportPresentation))
  }, [currentReportPresentation])
  return <Prototype.Provider value={{ files, selected, previewUrl, previewError, setPreviewError, selectFile, addFiles, loadDemo, reports, currentReport, realReports, presentationFiles, currentFilePresentation, currentRiskAssessment, currentProgress, currentRemovalPresentation, currentVerification, currentReportPresentation, progress, busy, scanning, scenario, setScenario, run, clearSession, inspection, retryInspection, cancelInspection, removal, planRealRemoval, setRemovalTargets, approveAndProcessRemoval, downloadVerifiedRemoval,
    drafts: allDrafts[selectedId] || {}, setDraft: (key, value) => setAllDrafts(old => ({ ...old, [selectedId]: { ...old[selectedId], [key]: value } })),
    removeFile: id => { if (running.current) return; if (selectedId === id) inspectionAbort.current?.abort(); removalAbort.current?.abort(); artifactOwnership.current.remove(id); releaseLocalInput(localInputs.current.get(id)); localInputs.current.delete(id); localFiles.current.delete(id); if (inspection?.fileId === id) setInspection(undefined); if (removal?.fileId === id) setRemoval(undefined); setFiles(old => old.filter(f => f.id !== id)); if (selectedId === id) selectFile(files.find(f => f.id !== id)?.id || '') },
    retryFile: id => { setScenario('normal'); setFiles(old => old.map(f => f.id === id ? { ...f, state: 'ready' } : f)); toast.info('Demo reset. You can run the workflow again.') },
  }}><TooltipProvider delay={300}>{children}<Toaster theme="dark" position="bottom-right" closeButton /></TooltipProvider></Prototype.Provider>
}
