import { createFormatAdapterRegistry } from '../processing-core/adapters/registry'
import { jpegAdapter } from '../processing-core/adapters/jpeg'
import { jpegVerifierAdapter } from '../processing-core/adapters/jpeg-verifier'
import { pngAdapter } from '../processing-core/adapters/png'
import { pngVerifierAdapter } from '../processing-core/adapters/png-verifier'

export function createDefaultFormatAdapterRegistry() {
  const registry = createFormatAdapterRegistry()
  registry.register(jpegAdapter)
  registry.register(jpegVerifierAdapter)
  registry.register(pngAdapter)
  registry.register(pngVerifierAdapter)
  return registry
}
