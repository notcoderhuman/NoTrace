import type { BoundaryResult } from './result'

export type InputSource = 'browser-file' | 'blob' | 'stream' | 'filesystem-handle' | 'opaque'

export type LocalInputDescriptor = Readonly<{
  id: string
  filename: string
  mimeType?: string
  size?: number
  source: InputSource
}>

export type ByteRange = Readonly<{ offset: number; length: number }>

/**
 * Opaque local input. Implementations may wrap browser or native handles, but
 * the processing core never assumes that a descriptor means bytes were read.
 */
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
      return { ok: false, error: { code: 'UNSUPPORTED', message: 'This Phase 1 input does not expose file bytes.' } }
    },
    release() { released = true },
  }
}
