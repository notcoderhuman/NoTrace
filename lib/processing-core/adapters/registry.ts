import type { LocalInputDescriptor } from '../domain/input'
import type { Operation } from '../domain/operation'
import type { BoundaryResult } from '../domain/result'
import type { ContentProbe } from '../domain/probe'
import type { LocalInput } from '../domain/input'
import type { InspectionResult } from '../domain/metadata'
import type { ProcessingResult, RemovalPlan } from '../domain/operation'
import { sameProcessingIdentity, type ProcessingIdentity } from '../domain/identity'
import { JPEG_PROCESSING_IDENTITY } from '../domain/identity'
import { JPEG_VERIFICATION_CHECK_IDS } from '../domain/result'
import { PNG_PROCESSING_IDENTITY, PNG_VERIFICATION_CHECK_IDS } from './png'
import { isStaticCapabilityDeclaration, isEvidenceRecord, type AdapterContract, type AdapterConformance, type EvidenceRecord, type FormatOperation, type StaticCapabilityDeclaration, type ResourceContract } from '../domain/contracts'

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

type ApprovedVerifierAuthority = Readonly<{ adapterId: string; formatId: string; compatibilityKey: string; identity: ProcessingIdentity; checkIds: readonly string[] }>
const approvedVerifierAuthorities: readonly ApprovedVerifierAuthority[] = Object.freeze([
  { adapterId: 'jpeg-verifier', formatId: 'jpeg', compatibilityKey: JPEG_PROCESSING_IDENTITY.verifierCompatibilityKey, identity: JPEG_PROCESSING_IDENTITY, checkIds: JPEG_VERIFICATION_CHECK_IDS },
  { adapterId: 'png-verifier', formatId: 'png', compatibilityKey: PNG_PROCESSING_IDENTITY.verifierCompatibilityKey, identity: PNG_PROCESSING_IDENTITY, checkIds: PNG_VERIFICATION_CHECK_IDS },
])
function resourceAllowsInput(adapter: FormatAdapter, input: LocalInput): boolean { const max = adapter.contract?.conformance.resource.inputBound.maxBytes; return max === undefined || (Number.isSafeInteger(max) && max > 0 && (input.descriptor.size === undefined || input.descriptor.size <= max)) }
function approvedVerifier(adapter: FormatAdapter): ApprovedVerifierAuthority | undefined {
  const declaration = adapter.contract?.conformance.declaration
  return approvedVerifierAuthorities.find(authority => authority.adapterId === adapter.id && authority.formatId === adapter.formatId && authority.compatibilityKey === adapter.verifierCompatibilityKey && declaration?.formatId === authority.formatId && declaration.verifierCompatibilityKey === authority.compatibilityKey && sameProcessingIdentity(declaration.processingIdentity, authority.identity) && sameStringSet(declaration.verificationCheckIds ?? [], authority.checkIds))
}

function frozenList<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values])
}

function frozenOptionalList<T>(values: readonly T[] | undefined): readonly T[] | undefined {
  return values === undefined ? undefined : Object.freeze([...values])
}

function frozenDeclaration(declaration: StaticCapabilityDeclaration): StaticCapabilityDeclaration {
  return Object.freeze({
    formatId: declaration.formatId,
    operations: frozenList(declaration.operations),
    extensions: frozenList(declaration.extensions),
    mimeTypes: frozenList(declaration.mimeTypes),
    processingIdentity: declaration.processingIdentity ? Object.freeze({ ...declaration.processingIdentity }) : undefined,
    verifierCompatibilityKey: declaration.verifierCompatibilityKey,
    verificationCheckIds: frozenOptionalList(declaration.verificationCheckIds),
  })
}

function frozenResource(resource: ResourceContract): ResourceContract {
  return Object.freeze({
    ...resource,
    inputBound: Object.freeze({ ...resource.inputBound }),
    fullBufferOperations: Object.freeze({ ...resource.fullBufferOperations }),
    streaming: Object.freeze({ ...resource.streaming }),
    worker: Object.freeze({ ...resource.worker }),
    transfer: Object.freeze({ ...resource.transfer }),
    concurrency: Object.freeze({ ...resource.concurrency }),
    cancellationPoints: frozenList(resource.cancellationPoints),
  })
}

function frozenConformance(conformance: AdapterConformance): AdapterConformance {
  return Object.freeze({
    level: conformance.level,
    declaration: frozenDeclaration(conformance.declaration),
    resource: frozenResource(conformance.resource),
    independentVerifier: conformance.independentVerifier,
  })
}

function frozenContract(contract: AdapterContract): AdapterContract {
  return Object.freeze({ ...contract, conformance: frozenConformance(contract.conformance) })
}

/**
 * Registry-owned immutable snapshot of the adapter metadata the registry uses to make authority
 * decisions. Every nested array and object is copied and frozen so mutating the caller's adapter
 * after registration can never change registry behaviour. Implementation functions are shared by
 * reference out of necessity; they are never an authority decision.
 */
function snapshotAdapter(adapter: FormatAdapter): FormatAdapter {
  return Object.freeze({
    ...adapter,
    capability: Object.freeze({
      extensions: frozenList(adapter.capability.extensions),
      mimeTypes: frozenList(adapter.capability.mimeTypes),
      operations: frozenList(adapter.capability.operations),
    }),
    verificationCheckIds: frozenOptionalList(adapter.verificationCheckIds),
    conformance: adapter.conformance ? frozenConformance(adapter.conformance) : undefined,
    contract: adapter.contract ? frozenContract(adapter.contract) : undefined,
  })
}

function validateAdapterShape(adapter: FormatAdapter): BoundaryResult<void> {
  if (!adapter || typeof adapter !== 'object') return { ok: false, error: { code: 'INVALID_INPUT', message: 'A format adapter object is required.' } }
  if (typeof adapter.id !== 'string' || !adapter.id.trim()) return { ok: false, error: { code: 'INVALID_INPUT', message: 'A format adapter identity is required.' } }
  const capability = adapter.capability as AdapterCapability | undefined
  if (!capability || typeof capability !== 'object' || !Array.isArray(capability.extensions) || !Array.isArray(capability.mimeTypes) || !Array.isArray(capability.operations)) {
    return { ok: false, error: { code: 'INVALID_INPUT', message: 'A format adapter requires a capability with extensions, mimeTypes and operations arrays.' } }
  }
  return { ok: true, value: undefined }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const expected = new Set(right)
  return expected.size === right.length && left.every(value => expected.has(value))
}

/**
 * A declaration may only omit its check identities when it makes no verification claim. A
 * verification claim without a canonical, non-empty, duplicate-free check set is not admissible.
 */
function validDeclaredCheckIds(declaration: StaticCapabilityDeclaration): boolean {
  const ids = declaration.verificationCheckIds
  if (ids === undefined) return !declaration.operations.includes('verifyRemoval')
  if (ids.length === 0 || new Set(ids).size !== ids.length) return false
  return ids.every(id => typeof id === 'string' && id.trim().length > 0)
}

/**
 * The canonical check identities a verifier must report. Sourced from the adapter's frozen contract
 * declaration; the adapter-level field is only a fallback for contract-less inspection adapters.
 * Never derived from a VerificationResult.
 */
export function canonicalVerificationCheckIds(adapter: FormatAdapter): readonly string[] | undefined {
  return adapter.contract?.conformance.declaration.verificationCheckIds ?? adapter.verificationCheckIds
}

function contractDeclaration(adapter: FormatAdapter) {
  return adapter.contract?.conformance.declaration
}

function hasValidEvidence(adapter: FormatAdapter): boolean {
  const declaration = contractDeclaration(adapter)
  if (!declaration || !declaration.operations.includes('inspect')) return true
  if (typeof adapter.evidence !== 'function' && typeof adapter.contract?.evidence !== 'function') return false
  try {
    const probe = { kind: 'inspection' as const, status: 'success' as const, input: { filename: 'contract-probe' }, format: { state: 'unknown' as const }, fields: [{ id: 'probe-target-0', label: 'Probe target', category: 'other' as const, classification: 'SAFE_TO_REMOVE' as const, value: 'present' }], warnings: [], analyzed: true as const }
    const records = adapter.evidence?.(probe) ?? adapter.contract?.evidence?.(probe) ?? []
    return Array.isArray(records) && records.length > 0 && records.every(isEvidenceRecord)
  } catch { return false }
}

function adapterProcessingIdentity(adapter: FormatAdapter) { const declaration = adapter.contract?.conformance.declaration; return declaration?.processingIdentity ?? (adapter.formatId && adapter.engineId && adapter.engineVersion && adapter.capabilityKey && adapter.verifierCompatibilityKey ? { formatId: adapter.formatId, engineId: adapter.engineId, engineVersion: adapter.engineVersion, capabilityKey: adapter.capabilityKey, policyId: '', policyVersion: '', verifierCompatibilityKey: adapter.verifierCompatibilityKey } : undefined) }

function validContract(adapter: FormatAdapter): boolean {
  const contract = adapter.contract
  const conformance = contract?.conformance
  const declaration = conformance?.declaration
  if (!contract || !conformance || !isStaticCapabilityDeclaration(declaration) || !hasValidEvidence(adapter)) return false
  const resource = conformance.resource
  if (!Number.isSafeInteger(resource.inputBound.maxBytes) || resource.inputBound.maxBytes <= 0) return false
  if (declaration.formatId !== adapter.formatId || (declaration.verifierCompatibilityKey ?? '') !== (adapter.verifierCompatibilityKey ?? '') || Boolean(declaration.processingIdentity && !adapterProcessingIdentity(adapter)) || Boolean(declaration.processingIdentity && adapterProcessingIdentity(adapter) && declaration.processingIdentity.formatId !== adapterProcessingIdentity(adapter)?.formatId) || Boolean(declaration.processingIdentity && ((adapter.engineId !== undefined && declaration.processingIdentity.engineId !== adapter.engineId) || (adapter.engineVersion !== undefined && declaration.processingIdentity.engineVersion !== adapter.engineVersion)))) return false
  if (!declaration.extensions.every(value => adapter.capability.extensions.includes(value)) || !declaration.mimeTypes.every(value => adapter.capability.mimeTypes.includes(value))) return false
  const exposed = adapter.capability.operations.map(operation => contractOperationFor[operation]).filter(Boolean) as FormatOperation[]
  if (!exposed.every(operation => declaration.operations.includes(operation))) return false
  if (isDestructive(adapter) && conformance.level === 'inspect-only') return false
  if (!validDeclaredCheckIds(declaration)) return false
  const actual = new Set<FormatOperation>()
  if (typeof adapter.inspect === 'function' || typeof contract.inspect === 'function') actual.add('inspect')
  if (typeof adapter.planRemoval === 'function' || typeof contract.planRemoval === 'function') actual.add('planRemoval')
  if (typeof adapter.remove === 'function' || typeof contract.executeRemoval === 'function') actual.add('executeRemoval')
  if (typeof adapter.verifyOutput === 'function' || typeof contract.verifyRemoval === 'function') actual.add('verifyRemoval')
  const executable = declaration.operations.filter(operation => ['inspect', 'planRemoval', 'executeRemoval', 'verifyRemoval', 'edit', 'provenanceRead', 'provenanceWrite', 'watermarkAnalysis', 'watermarkRemoval'].includes(operation))
  if (!executable.every(operation => actual.has(operation))) return false
  if (declaration.verificationCheckIds && adapter.verificationCheckIds && !sameStringSet(adapter.verificationCheckIds, declaration.verificationCheckIds)) return false
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
      const shape = validateAdapterShape(adapter)
      if (!shape.ok) return shape
      if (adapters.some(existing => existing.id === adapter.id)) return { ok: false, error: { code: 'INVALID_INPUT', message: `Adapter '${adapter.id}' is already registered.` } }
      const snapshot = snapshotAdapter(adapter)
      if (isDestructive(snapshot) && !validContract(snapshot)) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Destructive adapters require a valid canonical AdapterContract and conformance declaration.' } }
      adapters.push(snapshot)
      return { ok: true, value: undefined }
    },
    resolve(input, operation) {
      const adapter = adapters.find(candidate => matches(candidate, input, operation))
      return adapter ? { ok: true, value: adapter } : { ok: false, error: { code: 'UNSUPPORTED', message: `No adapter is registered for ${operation}.` } }
    },
    async resolveVerified(input, operation, signal) {
      const destructive = destructiveOperations.has(operation)
      const candidates = adapters.filter(candidate => resourceAllowsInput(candidate, input) && candidate.capability.operations.includes(operation)
        && typeof candidate.probe === 'function'
        && typeof candidate.formatId === 'string' && candidate.formatId.trim()
        && (!destructive || (candidate.role === 'transformer' && validContract(candidate) && typeof candidate.verifierCompatibilityKey === 'string' && candidate.verifierCompatibilityKey.trim().length > 0)))
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
      const adapter = adapters.find(candidate => matches(candidate, input, 'remove') && typeof candidate.remove === 'function' && validContract(candidate))
      return adapter ? { ok: true, value: adapter } : { ok: false, error: { code: 'UNSUPPORTED', message: 'No removal execution adapter is registered for this input.' } }
    },
    async resolveVerifiedVerifier(input, executorId, compatibilityKey, signal) {
      if (!compatibilityKey || !compatibilityKey.trim()) return { ok: false, error: { code: 'UNSUPPORTED', message: 'A verifier compatibility key is required for destructive execution.' } }
      const executor = adapters.find(candidate => candidate.id === executorId)
      if (!executor || executor.role !== 'transformer' || !executor.verifierCompatibilityKey || executor.verifierCompatibilityKey !== compatibilityKey) return { ok: false, error: { code: 'UNSUPPORTED', message: 'The destructive executor is not a compatible transformer.' } }
      const candidates = adapters.filter(candidate => candidate.capability.operations.includes('verify') && approvedVerifier(candidate)?.identity && sameProcessingIdentity(approvedVerifier(candidate)?.identity, adapterProcessingIdentity(executor)) && candidate.role === 'verifier' && validContract(candidate) && candidate.contract?.conformance.independentVerifier === true && typeof candidate.verifyOutput === 'function' && candidate.id !== executorId && candidate.verifierIndependence === 'structural-independent' && approvedVerifier(candidate) !== undefined && typeof candidate.probe === 'function' && typeof candidate.formatId === 'string' && candidate.formatId.trim() && candidate.verifierCompatibilityKey === compatibilityKey && (candidate.verifyOutput as unknown) !== (executor.remove as unknown) && (candidate.verifyOutput as unknown) !== (executor.contract?.executeRemoval as unknown))
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
