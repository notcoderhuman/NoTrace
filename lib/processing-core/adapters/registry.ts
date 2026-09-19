import type { LocalInputDescriptor } from '../domain/input'
import type { Operation } from '../domain/operation'
import type { BoundaryResult } from '../domain/result'
import type { ContentProbe } from '../domain/probe'
import type { LocalInput } from '../domain/input'
import type { InspectionResult } from '../domain/metadata'
import type { ProcessingResult, RemovalPlan } from '../domain/operation'
import { isStaticCapabilityDeclaration, isEvidenceRecord, type AdapterContract, type AdapterConformance, type EvidenceRecord, type FormatOperation } from '../domain/contracts'

export type AdapterCapability = Readonly<{
  extensions: readonly string[]
  mimeTypes: readonly string[]
  operations: readonly Operation[]
}>

export type FormatAdapter = Readonly<{
  id: string
  /** Explicit format/engine binding; hints never establish authenticity. */
  formatId?: string
  engineId?: string
  engineVersion?: string
  capabilityKey?: string
  verifierCompatibilityKey?: string
  verifierIndependence?: 'structural-independent' | string
  verificationCheckIds?: readonly string[]
  probe?: (input: LocalInput, signal?: AbortSignal) => Promise<BoundaryResult<ContentProbe>>
  capability: AdapterCapability
  conformance?: AdapterConformance
  evidence?: (result: InspectionResult) => readonly EvidenceRecord[]
  contract?: AdapterContract
  inspect?: (input: LocalInput, signal?: AbortSignal) => Promise<BoundaryResult<InspectionResult>>
  planRemoval?: (input: LocalInput, targetIds: readonly string[], policy: string, signal?: AbortSignal) => Promise<BoundaryResult<RemovalPlan>>
  remove?: (input: LocalInput, plan: RemovalPlan, approval: import('../domain/operation').RemovalApproval, signal?: AbortSignal) => Promise<BoundaryResult<ProcessingResult>>
  verifierId?: string
  role?: 'transformer' | 'verifier'
  verifyOutput?: (input: LocalInput, output: import('../domain/artifact').OutputArtifact, plan: RemovalPlan, approval: import('../domain/operation').RemovalApproval, signal?: AbortSignal) => Promise<BoundaryResult<import('../domain/result').VerificationResult>>
}>

export interface FormatAdapterRegistry {
  register(adapter: FormatAdapter): BoundaryResult<void>
  resolve(input: LocalInputDescriptor, operation: Operation): BoundaryResult<FormatAdapter>
  resolveVerified(input: LocalInput, operation: Operation, signal?: AbortSignal): Promise<BoundaryResult<FormatAdapter>>
  resolveVerifiedVerifier(input: LocalInput, executorId: string, compatibilityKey: string | undefined, signal?: AbortSignal): Promise<BoundaryResult<FormatAdapter>>
  resolveInspection(input: LocalInputDescriptor): BoundaryResult<FormatAdapter>
  resolveRemovalPlan(input: LocalInputDescriptor): BoundaryResult<FormatAdapter>
  resolveRemoval(input: LocalInputDescriptor): BoundaryResult<FormatAdapter>
  resolveVerifier(input: LocalInputDescriptor, executorId?: string, compatibilityKey?: string): BoundaryResult<FormatAdapter>
  list(): readonly FormatAdapter[]
}

const destructiveOperations = new Set<Operation>(['remove'])
const contractOperationFor: Partial<Record<Operation, FormatOperation>> = { inspect: 'inspect', remove: 'executeRemoval', verify: 'verifyRemoval' }

function contractDeclaration(adapter: FormatAdapter) {
  return adapter.contract?.conformance.declaration
}

function hasValidEvidence(adapter: FormatAdapter): boolean {
  const declaration = contractDeclaration(adapter)
  if (!declaration || !declaration.operations.includes('inspect')) return true
  if (typeof adapter.evidence !== 'function' && typeof adapter.contract?.evidence !== 'function') return false
  try {
    const records = adapter.evidence?.({ kind: 'inspection', status: 'success', input: { filename: 'contract-probe' }, format: { state: 'unknown' }, fields: [], warnings: [], analyzed: true } as InspectionResult) ?? adapter.contract?.evidence?.({ kind: 'inspection', status: 'success', input: { filename: 'contract-probe' }, format: { state: 'unknown' }, fields: [], warnings: [], analyzed: true } as InspectionResult) ?? []
    return Array.isArray(records) && records.every(isEvidenceRecord)
  } catch { return false }
}

function validContract(adapter: FormatAdapter): boolean {
  const contract = adapter.contract
  const conformance = contract?.conformance
  const declaration = conformance?.declaration
  if (!contract || !conformance || !isStaticCapabilityDeclaration(declaration) || !hasValidEvidence(adapter)) return false
  if (declaration.formatId !== adapter.formatId || (declaration.verifierCompatibilityKey ?? '') !== (adapter.verifierCompatibilityKey ?? '')) return false
  if (!declaration.extensions.every(value => adapter.capability.extensions.includes(value)) || !declaration.mimeTypes.every(value => adapter.capability.mimeTypes.includes(value))) return false
  const exposed = adapter.capability.operations.map(operation => contractOperationFor[operation]).filter(Boolean) as FormatOperation[]
  if (!exposed.every(operation => declaration.operations.includes(operation))) return false
  if (declaration.operations.includes('inspect') && typeof contract.inspect !== 'function' && typeof adapter.inspect !== 'function' && !adapter.planRemoval) return false
  if (declaration.operations.includes('planRemoval') && typeof contract.planRemoval !== 'function' && typeof adapter.planRemoval !== 'function') return false
  if (declaration.operations.includes('executeRemoval') && typeof contract.executeRemoval !== 'function' && typeof adapter.remove !== 'function') return false
  if (declaration.operations.includes('verifyRemoval') && typeof contract.verifyRemoval !== 'function' && typeof adapter.verifyOutput !== 'function') return false
  return true
}

function isDestructive(adapter: FormatAdapter): boolean {
  return adapter.capability.operations.some(operation => destructiveOperations.has(operation)) || adapter.role === 'verifier' && adapter.capability.operations.includes('verify')
}

function matches(adapter: FormatAdapter, input: LocalInputDescriptor, operation: Operation) {
  if (!adapter.capability.operations.includes(operation)) return false
  const declaration = contractDeclaration(adapter)
  const canonicalOperation = contractOperationFor[operation]
  if (declaration && canonicalOperation && !declaration.operations.includes(canonicalOperation)) return false
  const extensions = declaration?.extensions ?? adapter.capability.extensions
  const mimeTypes = declaration?.mimeTypes ?? adapter.capability.mimeTypes
  const extension = input.filename.split('.').pop()?.toLowerCase()
  return Boolean((extension && extensions.includes(extension)) || (input.mimeType && mimeTypes.includes(input.mimeType)))
}

export function createFormatAdapterRegistry(): FormatAdapterRegistry {
  const adapters: FormatAdapter[] = []
  return {
    register(adapter) {
      if (adapters.some(existing => existing.id === adapter.id)) return { ok: false, error: { code: 'INVALID_INPUT', message: `Adapter '${adapter.id}' is already registered.` } }
      if (isDestructive(adapter) && !validContract(adapter)) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Destructive adapters require a valid canonical AdapterContract and conformance declaration.' } }
      adapters.push(adapter)
      return { ok: true, value: undefined }
    },
    resolve(input, operation) {
      const adapter = adapters.find(candidate => matches(candidate, input, operation))
      return adapter ? { ok: true, value: adapter } : { ok: false, error: { code: 'UNSUPPORTED', message: `No adapter is registered for ${operation}.` } }
    },
    async resolveVerified(input, operation, signal) {
      const candidates = adapters.filter(candidate => candidate.capability.operations.includes(operation) && typeof candidate.probe === 'function' && typeof candidate.formatId === 'string' && candidate.formatId.trim())
      if (!candidates.length) return { ok: false, error: { code: 'UNSUPPORTED', message: `No content-probing adapter is registered for ${operation}.` } }
      const matched: FormatAdapter[] = []
      for (const candidate of candidates) {
        if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Content probing was cancelled.' } }
        let probed: BoundaryResult<ContentProbe>
        try { probed = await candidate.probe!(input, signal) } catch { return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Content probing could not be completed.' } } }
        if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Content probing was cancelled.' } }
        if (!probed.ok) { if (probed.error.code === 'CANCELLED' || probed.error.code === 'LIMIT_EXCEEDED') return probed; continue }
        if (!probed.value || probed.value.confidence !== 'structural' || probed.value.formatId !== candidate.formatId || !candidate.capability.mimeTypes.includes(probed.value.mediaType)) continue
        matched.push(candidate)
      }
      if (matched.length !== 1) return { ok: false, error: { code: matched.length > 1 ? 'INVALID_INPUT' : 'UNSUPPORTED', message: matched.length > 1 ? 'Content matches multiple capabilities.' : 'Content does not match a registered capability.' } }
      return { ok: true, value: matched[0] }
    },
    resolveInspection(input) {
      const adapter = adapters.find(candidate => matches(candidate, input, 'inspect') && typeof candidate.inspect === 'function')
      return adapter ? { ok: true, value: adapter } : { ok: false, error: { code: 'UNSUPPORTED', message: 'No inspection adapter is registered for this input.' } }
    },
    resolveRemovalPlan(input) {
      const adapter = adapters.find(candidate => matches(candidate, input, 'inspect') && typeof candidate.planRemoval === 'function')
      return adapter ? { ok: true, value: adapter } : { ok: false, error: { code: 'UNSUPPORTED', message: 'No removal planning adapter is registered for this input.' } }
    },
    resolveRemoval(input) {
      const adapter = adapters.find(candidate => matches(candidate, input, 'remove') && typeof candidate.remove === 'function')
      return adapter ? { ok: true, value: adapter } : { ok: false, error: { code: 'UNSUPPORTED', message: 'No removal execution adapter is registered for this input.' } }
    },
    async resolveVerifiedVerifier(input, executorId, compatibilityKey, signal) {
      if (!compatibilityKey || !compatibilityKey.trim()) return { ok: false, error: { code: 'UNSUPPORTED', message: 'A verifier compatibility key is required for destructive execution.' } }
      const executor = adapters.find(candidate => candidate.id === executorId)
      if (!executor || executor.role !== 'transformer' || !executor.verifierCompatibilityKey || executor.verifierCompatibilityKey !== compatibilityKey) return { ok: false, error: { code: 'UNSUPPORTED', message: 'The destructive executor is not a compatible transformer.' } }
      const candidates = adapters.filter(candidate => candidate.capability.operations.includes('verify') && candidate.role === 'verifier' && validContract(candidate) && candidate.contract?.conformance.independentVerifier === true && typeof candidate.verifyOutput === 'function' && candidate.id !== executorId && candidate.verifierIndependence === 'structural-independent' && typeof candidate.probe === 'function' && typeof candidate.formatId === 'string' && candidate.formatId.trim() && candidate.verifierCompatibilityKey === compatibilityKey)
      if (!candidates.length) return { ok: false, error: { code: 'UNSUPPORTED', message: 'No content-verified independent verifier is registered.' } }
      const matched: FormatAdapter[] = []
      for (const candidate of candidates) {
        if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Verifier selection was cancelled.' } }
        let probed: BoundaryResult<ContentProbe>
        try { probed = await candidate.probe!(input, signal) } catch { return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Verifier content probing could not be completed.' } } }
        if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Verifier selection was cancelled.' } }
        if (!probed.ok) { if (probed.error.code === 'CANCELLED' || probed.error.code === 'LIMIT_EXCEEDED') return probed; continue }
        if (probed.value.confidence === 'structural' && probed.value.formatId === candidate.formatId && candidate.capability.mimeTypes.includes(probed.value.mediaType)) matched.push(candidate)
      }
      if (matched.length !== 1) return { ok: false, error: { code: matched.length > 1 ? 'INVALID_INPUT' : 'UNSUPPORTED', message: matched.length > 1 ? 'Content matches multiple independent verifiers.' : 'No content-verified independent verifier is registered.' } }
      return { ok: true, value: matched[0] }
    },
    resolveVerifier(input, executorId, compatibilityKey) {
      const adapter = adapters.find(candidate => matches(candidate, input, 'verify') && candidate.role === 'verifier' && typeof candidate.verifyOutput === 'function' && candidate.id !== executorId && (!compatibilityKey || candidate.verifierCompatibilityKey === compatibilityKey))
      return adapter ? { ok: true, value: adapter } : { ok: false, error: { code: 'UNSUPPORTED', message: 'LEGACY / NON-DESTRUCTIVE / NON-AUTHORITATIVE verifier resolution is unavailable for destructive execution.' } }
    },
    list: () => adapters.slice(),
  }
}
