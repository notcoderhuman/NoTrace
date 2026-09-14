import { createFormatAdapterRegistry } from '../processing-core/adapters/registry'
import { jpegAdapter } from '../processing-core/adapters/jpeg'
import { jpegVerifierAdapter } from '../processing-core/adapters/jpeg-verifier'

export function createDefaultFormatAdapterRegistry() {
  const registry = createFormatAdapterRegistry()
  registry.register(jpegAdapter)
  registry.register(jpegVerifierAdapter)
  return registry
}
