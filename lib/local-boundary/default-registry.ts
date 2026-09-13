import { createFormatAdapterRegistry } from '../processing-core/adapters/registry'
import { jpegAdapter } from '../processing-core/adapters/jpeg'

export function createDefaultFormatAdapterRegistry() {
  const registry = createFormatAdapterRegistry()
  registry.register(jpegAdapter)
  return registry
}
