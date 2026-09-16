import type { BoundaryResult } from '../domain/result'

export type IndependentJpegRecord = Readonly<{ start: number; end: number; marker: number; kind: 'soi' | 'segment' | 'scan' | 'eoi'; ordinal: number }>
export type IndependentJpegScan = Readonly<{ records: readonly IndependentJpegRecord[]; comRecords: readonly IndependentJpegRecord[] }>

const MAX_BYTES = 32 * 1024 * 1024
const MAX_RECORDS = 65_536

export function scanJpegForVerification(bytes: Uint8Array, signal?: AbortSignal): BoundaryResult<IndependentJpegScan> {
  const fail = (message: string): BoundaryResult<IndependentJpegScan> => ({ ok: false, error: { code: 'VERIFICATION_FAILED', message } })
  if (bytes.length > MAX_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG output exceeds the verification size limit.' } }
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return fail('JPEG SOI is missing.')
  const records: IndependentJpegRecord[] = [{ start: 0, end: 2, marker: 0xd8, kind: 'soi', ordinal: 0 }]
  const comRecords: IndependentJpegRecord[] = []
  let offset = 2
  let sawScan = false
  let sawEoi = false
  let comOrdinal = 0
  const push = (record: IndependentJpegRecord) => { if (records.length >= MAX_RECORDS) throw new Error('limit'); records.push(record); if (record.marker === 0xfe) comRecords.push(record) }
  while (offset < bytes.length) {
    if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'JPEG verification was cancelled.' } }
    const start = offset
    if (bytes[offset++] !== 0xff) return fail('JPEG marker prefix is invalid.')
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    if (offset >= bytes.length) return fail('JPEG marker is truncated.')
    const marker = bytes[offset++]
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0x02 && marker <= 0xbf)) return fail('JPEG marker is invalid.')
    if (marker === 0xd9) { push({ start, end: offset, marker, kind: 'eoi', ordinal: 0 }); sawEoi = true; break }
    if (marker >= 0xd0 && marker <= 0xd7) { push({ start, end: offset, marker, kind: 'segment', ordinal: 0 }); continue }
    if (offset + 2 > bytes.length) return fail('JPEG segment length is truncated.')
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) return fail('JPEG segment bounds are invalid.')
    const end = offset + length
    const payloadStart = offset + 2
    const payloadLength = length - 2
    const ordinal = marker === 0xfe ? comOrdinal++ : 0
    push({ start, end, marker, kind: 'segment', ordinal })
    offset = end
    if (marker === 0xda) {
      sawScan = true
      const scanStart = offset
      let markerStart = offset
      while (offset < bytes.length) {
        if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'JPEG verification was cancelled.' } }
        if (bytes[offset++] !== 0xff) continue
        while (offset < bytes.length && bytes[offset] === 0xff) offset++
        if (offset >= bytes.length) return fail('JPEG entropy marker is truncated.')
        const next = bytes[offset]
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { offset++; continue }
        markerStart = offset - 1
        break
      }
      if (markerStart <= scanStart || markerStart > bytes.length) return fail('JPEG scan payload is invalid.')
      records[records.length - 1] = { ...records[records.length - 1], end: markerStart }
      push({ start: scanStart, end: markerStart, marker: 0, kind: 'scan', ordinal: 0 })
      offset = markerStart
      continue
    }
    if (payloadStart + payloadLength > bytes.length) return fail('JPEG payload bounds are invalid.')
  }
  if (!sawEoi || offset !== bytes.length) return fail('JPEG EOI or trailing-byte rule failed.')
  if (!sawScan) return fail('JPEG scan is missing.')
  return { ok: true, value: { records, comRecords } }
}
