import type { LocalInputDescriptor } from '../domain/input'
import type { Operation } from '../domain/operation'
import type { BoundaryResult } from '../domain/result'
import type { LocalInput } from '../domain/input'
import type { InspectionResult } from '../domain/metadata'
import type { ProcessingResult, RemovalPlan } from '../domain/operation'

export type AdapterCapability = Readonly<{
  extensions: readonly string[]
  mimeTypes: readonly string[]
  operations: readonly Operation[]
}>

export type FormatAdapter = Readonly<{
  id: string
  capability: AdapterCapability
  inspect?: (input: LocalInput) => Promise<BoundaryResult<InspectionResult>>
  planRemoval?: (input: LocalInput, targetIds: readonly string[], policy: string, signal?: AbortSignal) => Promise<BoundaryResult<RemovalPlan>>
  remove?: (input: LocalInput, plan: RemovalPlan, approval: import('../domain/operation').RemovalApproval, signal?: AbortSignal) => Promise<BoundaryResult<ProcessingResult>>
  verifyOutput?: (input: LocalInput, output: import('../domain/artifact').OutputArtifact, plan: RemovalPlan, approval: import('../domain/operation').RemovalApproval, signal?: AbortSignal) => Promise<BoundaryResult<import('../domain/result').VerificationResult>>
}>

export interface FormatAdapterRegistry {
  register(adapter: FormatAdapter): BoundaryResult<void>
  resolve(input: LocalInputDescriptor, operation: Operation): BoundaryResult<FormatAdapter>
  resolveInspection(input: LocalInputDescriptor): BoundaryResult<FormatAdapter>
  resolveRemovalPlan(input: LocalInputDescriptor): BoundaryResult<FormatAdapter>
  resolveRemoval(input: LocalInputDescriptor): BoundaryResult<FormatAdapter>
  list(): readonly FormatAdapter[]
}

function matches(adapter: FormatAdapter, input: LocalInputDescriptor, operation: Operation) {
  if (!adapter.capability.operations.includes(operation)) return false
  const extension = input.filename.split('.').pop()?.toLowerCase()
  return Boolean((extension && adapter.capability.extensions.includes(extension)) || (input.mimeType && adapter.capability.mimeTypes.includes(input.mimeType)))
}

export function createFormatAdapterRegistry(): FormatAdapterRegistry {
  const adapters: FormatAdapter[] = []
  return {
    register(adapter) {
      if (adapters.some(existing => existing.id === adapter.id)) return { ok: false, error: { code: 'INVALID_INPUT', message: `Adapter '${adapter.id}' is already registered.` } }
      adapters.push(adapter)
      return { ok: true, value: undefined }
    },
    resolve(input, operation) {
      const adapter = adapters.find(candidate => matches(candidate, input, operation))
      return adapter ? { ok: true, value: adapter } : { ok: false, error: { code: 'UNSUPPORTED', message: `No adapter is registered for ${operation}.` } }
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
    list: () => adapters.slice(),
  }
}
