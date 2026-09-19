export * from './domain/file'
export * from './domain/input'
export * from './domain/metadata'
export * from './domain/operation'
export * from './domain/result'
export * from './domain/identity'
export * from './domain/ownership'
export * from './domain/probe'
export * from './domain/limits'
export * from './domain/artifact'
export * from './domain/contracts'
export * from './domain/boundary'
export * from './classification/policy'
export * from './classification/safety-policy'
export * from './adapters/registry'
export * from './adapters/contracts'
export * from './adapters/jpeg'
export * from './adapters/png'
export * from './adapters/png-verifier'
// The canonical independent verifier must be reachable from the public surface. The transformer
// barrel above deliberately no longer exports the non-independent `verifyJpegOutput`, which was
// removed in the same change.
export * from './adapters/jpeg-verifier'

/**
 * DEFERRED (not addressed in the contract-bypass pass, tracked as known-open):
 * - `createEngineCapabilityRegistry` (`./adapters/contracts`) is a parallel, weaker capability
 *   authority: its `resolve(format, 'verify')` performs no content probe, no compatibility-key
 *   binding and no single-candidate arbitration. It has no production consumer. Removing or
 *   reshaping it is an API migration, not a correctness fix.
 * - `FormatAdapterRegistry.resolveVerifier` (`./adapters/registry`) returns a live adapter without
 *   contract/independence arbitration despite its message claiming that resolution is unavailable.
 *   It has no production consumer and every registered verifier is now contract-backed, so it
 *   cannot return a contract-less verifier. Removing it is also an API migration.
 * Both are flagged in the v0.13.3 red-team follow-up list (B10).
 */
