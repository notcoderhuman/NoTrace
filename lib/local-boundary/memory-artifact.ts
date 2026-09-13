import type { OutputArtifact } from '../processing-core/domain/artifact'
import type { ByteRange } from '../processing-core/domain/input'
import type { BoundaryResult } from '../processing-core/domain/result'

export function createMemoryArtifact(bytes: Uint8Array, filename: string, mediaType = 'image/jpeg'): OutputArtifact {
  const copy = new Uint8Array(bytes)
  const id = crypto.randomUUID()
  let disposed = false
  return {
    id,
    filename,
    mediaType,
    size: copy.byteLength,
    async read(range?: ByteRange, signal?: AbortSignal): Promise<BoundaryResult<Uint8Array>> {
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
