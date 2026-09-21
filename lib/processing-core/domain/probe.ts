import type { BoundaryResult } from './result'
import type { LocalInput } from './input'

export type ContentProbe = Readonly<{ formatId: string; mediaType: string; confidence: 'structural' }>
export type ContentProbeAdapter = Readonly<{ formatId: string; probe(input: LocalInput, signal?: AbortSignal): Promise<BoundaryResult<ContentProbe>> }>

/** Bounded content probing is authoritative; filename and MIME are routing hints only. */
export async function probePrefix(input: LocalInput, length: number, signal?: AbortSignal): Promise<BoundaryResult<Uint8Array>> {
  if (!Number.isSafeInteger(length) || length <= 0 || length > 64 * 1024) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Probe length is invalid.' } }
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Content probing was cancelled.' } }
  let boundedLength: number
  try { const claimed = input.descriptor.size; boundedLength = claimed === undefined ? length : Math.min(length, claimed) } catch { return { ok: false, error: { code: 'INVALID_INPUT', message: 'Input size metadata is invalid.' } } }
  if (!Number.isFinite(boundedLength) || boundedLength <= 0) return { ok: false, error: { code: 'UNSUPPORTED', message: 'Input is too small to probe.' } }
  return input.read({ offset: 0, length: boundedLength }, signal)
}
