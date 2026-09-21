import { createFormatAdapterRegistry } from '../processing-core/adapters/registry'
import { jpegAdapter } from '../processing-core/adapters/jpeg'
import { jpegVerifierAdapter } from '../processing-core/adapters/jpeg-verifier'
import { pngAdapter } from '../processing-core/adapters/png'
import { pngVerifierAdapter } from '../processing-core/adapters/png-verifier'

export function createDefaultFormatAdapterRegistry() {
  const registry = createFormatAdapterRegistry()
  for (const adapter of [jpegAdapter, jpegVerifierAdapter, pngAdapter, pngVerifierAdapter]) {
    const result = registry.register(adapter)
    if (!result.ok) throw new Error(`Canonical adapter registration failed: ${result.error.message}`)
  }
  return registry
}
