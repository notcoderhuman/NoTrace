import type { Operation } from '../domain/operation'

/** Phase 1 defaults are fail-closed; real limits must be selected before parsing. */
export type RemovalScope = Readonly<{ formatId: string; scopeId: string }>

export type SafetyPolicy = Readonly<{
  maxInputBytes: number
  maxOutputBytes: number
  /** Applies to one real destructive operation; the UI session queue is separate. */
  maxFiles: number
  maxSegments: number
  maxMetadataSegmentBytes: number
  maxTotalMetadataBytes: number
  allowedOperations: readonly Operation[]
  allowedRemovalScopes: readonly RemovalScope[]
  /** Verified in-memory output is allowed; provider download remains a separate gate. */
  allowOutput: boolean
  preserveOriginal: true
  failClosed: true
  retainInMemoryOnly: true
  preserveProtectedSegments: true
  preserveUnknownSegments: true
  requireIndependentVerification: true
}>

export const structuralLimits = Object.freeze({
  maxInputBytes: 32 * 1024 * 1024,
  maxOutputBytes: 32 * 1024 * 1024,
  maxFiles: 1,
  maxSegments: 65_536,
  maxMetadataSegmentBytes: 16 * 1024 * 1024,
  maxTotalMetadataBytes: 32 * 1024 * 1024,
} as const)

export const phaseOneSafetyPolicy: SafetyPolicy = Object.freeze({
  ...structuralLimits,
  allowedOperations: Object.freeze(['inspect', 'remove', 'edit', 'verify'] as Operation[]),
  allowedRemovalScopes: Object.freeze([{ formatId: 'jpeg', scopeId: 'jpeg-com' }] as RemovalScope[]),
  allowOutput: true,
  preserveOriginal: true,
  failClosed: true,
  retainInMemoryOnly: true,
  preserveProtectedSegments: true,
  preserveUnknownSegments: true,
  requireIndependentVerification: true,
})
