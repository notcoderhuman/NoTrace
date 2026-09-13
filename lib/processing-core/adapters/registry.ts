import type { LocalInputDescriptor } from '../domain/input'
import type { Operation } from '../domain/operation'
import type { BoundaryResult } from '../domain/result'

export type AdapterCapability = Readonly<{
  extensions: readonly string[]
  mimeTypes: readonly string[]
  operations: readonly Operation[]
}>

export type FormatAdapter = Readonly<{
  id: string
  capability: AdapterCapability
}>

export interface FormatAdapterRegistry {
  register(adapter: FormatAdapter): BoundaryResult<void>
  resolve(input: LocalInputDescriptor, operation: Operation): BoundaryResult<FormatAdapter>
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
    list: () => adapters.slice(),
  }
}
