import { createMemoryInput, type ByteRange, type LocalInput, type LocalInputDescriptor } from '../processing-core/domain/input'
import type { BoundaryResult } from '../processing-core/domain/result'

export const DEFAULT_BROWSER_INPUT_MAX_BYTES = 32 * 1024 * 1024

export function createBrowserFileInput(file: File, maxBytes = DEFAULT_BROWSER_INPUT_MAX_BYTES): LocalInput {
  const descriptor: LocalInputDescriptor = {
    id: crypto.randomUUID(),
    filename: file.name,
    mimeType: file.type || undefined,
    size: file.size,
    source: 'browser-file',
  }
  let released = false
  return {
    descriptor,
    async read(range?: ByteRange, signal?: AbortSignal): Promise<BoundaryResult<Uint8Array>> {
      if (released) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Local input has been released.' } }
      if (file.size > maxBytes) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'Local input exceeds the inspection size limit.' } }
      if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Input read was cancelled.' } }
      const offset = range?.offset ?? 0
      const length = range?.length ?? file.size - offset
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > file.size || length > maxBytes) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Requested byte range is invalid.' } }
      try {
        const bytes = new Uint8Array(await file.slice(offset, offset + length).arrayBuffer())
        if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Input read was cancelled.' } }
        return { ok: true, value: bytes }
      } catch {
        return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Local input could not be read.' } }
      }
    },
    release() { released = true; file = undefined as never },
  }
}

export function createMemoryFileInput(bytes: Uint8Array, descriptor: Omit<LocalInputDescriptor, 'source' | 'size'> & { size?: number }): LocalInput {
  return createMemoryInput(bytes, descriptor)
}
