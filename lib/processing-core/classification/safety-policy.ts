import type { Operation } from '../domain/operation'

/** Phase 1 defaults are fail-closed; real limits must be selected before parsing. */
export type SafetyPolicy = Readonly<{
  maxInputBytes: number
  maxOutputBytes: number
  maxFiles: number
  allowedOperations: readonly Operation[]
  allowOutput: boolean
  preserveOriginal: true
  failClosed: true
  retainInMemoryOnly: true
}>

export const phaseOneSafetyPolicy: SafetyPolicy = Object.freeze({
  maxInputBytes: 0,
  maxOutputBytes: 0,
  maxFiles: 1,
  allowedOperations: Object.freeze(['inspect', 'remove', 'edit', 'verify'] as Operation[]),
  allowOutput: false,
  preserveOriginal: true,
  failClosed: true,
  retainInMemoryOnly: true,
})
