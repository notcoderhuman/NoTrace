import type { BoundaryResult } from './result'

export type InputSource = 'browser-file' | 'blob' | 'stream' | 'filesystem-handle' | 'opaque' | 'memory'

export type LocalInputDescriptor = Readonly<{
  id: string
  filename: string
  mimeType?: string
  size?: number
  source: InputSource
}>

export type ByteRange = Readonly<{ offset: number; length: number }>
export const DEFAULT_INSPECTION_MAX_BYTES = 32 * 1024 * 1024

/** Opaque local input. The core never reads filesystem paths directly. */
export interface LocalInput {
  readonly descriptor: LocalInputDescriptor
  read(range?: ByteRange, signal?: AbortSignal): Promise<BoundaryResult<Uint8Array>>
  release(): void
}

export function createDescriptorInput(descriptor: LocalInputDescriptor): LocalInput {
  let released = false
  return {
    descriptor,
    async read() {
      if (released) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Local input has been released.' } }
      return { ok: false, error: { code: 'UNSUPPORTED', message: 'This input does not expose file bytes.' } }
    },
    release() { released = true },
  }
}

export function createMemoryInput(bytes: Uint8Array, descriptor: Omit<LocalInputDescriptor, 'size' | 'source'> & { size?: number }): LocalInput {
  const copy = new Uint8Array(bytes)
  let released = false
  const fullDescriptor: LocalInputDescriptor = { ...descriptor, size: descriptor.size ?? copy.byteLength, source: 'memory' }
  return {
    descriptor: fullDescriptor,
    async read(range, signal) {
      if (released) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Local input has been released.' } }
      if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Input read was cancelled.' } }
      const offset = range?.offset ?? 0
      const length = range?.length ?? copy.byteLength - offset
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > copy.byteLength) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Requested byte range is invalid.' } }
      return { ok: true, value: copy.slice(offset, offset + length) }
    },
    release() { released = true },
  }
}
