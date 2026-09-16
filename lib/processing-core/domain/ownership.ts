import type { BoundaryResult } from './result'
import type { LocalInput } from './input'
import type { OutputArtifact } from './artifact'

/** A release operation is idempotent and observable for ownership accounting. */
export function releaseLocalInput(input: LocalInput | undefined): BoundaryResult<void> {
  if (!input) return { ok: true, value: undefined }
  try { input.release(); return { ok: true, value: undefined } }
  catch { return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Local input cleanup failed.' } } }
}

export type ArtifactOwnershipState = 'CREATED' | 'EXECUTION_OWNED' | 'VERIFIED' | 'TRANSFERRED' | 'PROVIDER_OWNED' | 'DISPOSED'

export type OwnedArtifact = Readonly<{ artifact: OutputArtifact; state: ArtifactOwnershipState }>

const TRANSITIONS: Readonly<Record<ArtifactOwnershipState, readonly ArtifactOwnershipState[]>> = {
  CREATED: ['EXECUTION_OWNED'],
  EXECUTION_OWNED: ['VERIFIED', 'DISPOSED'],
  VERIFIED: ['TRANSFERRED', 'DISPOSED'],
  TRANSFERRED: ['PROVIDER_OWNED', 'DISPOSED'],
  PROVIDER_OWNED: ['DISPOSED'],
  DISPOSED: [],
}

export function transitionOwnedArtifact(owned: OwnedArtifact, next: ArtifactOwnershipState): BoundaryResult<OwnedArtifact> {
  if (!TRANSITIONS[owned.state].includes(next)) return { ok: false, error: { code: 'INVALID_INPUT', message: `Invalid artifact ownership transition ${owned.state} -> ${next}.` } }
  return { ok: true, value: { artifact: owned.artifact, state: next } }
}

export function transferVerifiedArtifact(owned: OwnedArtifact): BoundaryResult<OwnedArtifact> {
  return transitionOwnedArtifact(owned, 'TRANSFERRED')
}
