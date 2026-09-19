import type { ByteRange } from './input'
import type { BoundaryResult } from './result'

/** Opaque, bounded, in-memory output contract. The artifact is not verified by this contract. */
export interface OutputArtifact {
  readonly id: string
  readonly filename: string
  readonly mediaType?: string
  readonly size: number
  read(range?: ByteRange, signal?: AbortSignal): Promise<BoundaryResult<Uint8Array>>
  dispose(): void
}

const disposedArtifacts = new WeakSet<object>()

export function disposeArtifact(artifact: OutputArtifact | undefined): BoundaryResult<void> {
  if (!artifact) return { ok: true, value: undefined }
  if (disposedArtifacts.has(artifact)) return { ok: true, value: undefined }
  try {
    artifact.dispose()
    disposedArtifacts.add(artifact)
    return { ok: true, value: undefined }
  } catch {
    return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Output artifact cleanup failed.' } }
  }
}

export function createMemoryArtifact(bytes: Uint8Array, filename: string, mediaType?: string): OutputArtifact {
  const copy = new Uint8Array(bytes)
  const id = crypto.randomUUID()
  let disposed = false
  return {
    id,
    filename,
    mediaType,
    size: copy.byteLength,
    async read(range, signal) {
      if (disposed) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Output artifact has been disposed.' } }
      if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Output read was cancelled.' } }
      const offset = range?.offset ?? 0
      const length = range?.length ?? copy.byteLength - offset
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > copy.byteLength) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Requested output byte range is invalid.' } }
      return { ok: true, value: copy.slice(offset, offset + length) }
    },
    dispose() { disposed = true },
  }
}
