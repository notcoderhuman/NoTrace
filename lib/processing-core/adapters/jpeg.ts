import type { LocalInput } from '../domain/input'
import type { InspectionResult, MetadataField } from '../domain/metadata'
import type { BoundaryResult } from '../domain/result'
import type { FormatAdapter } from './registry'

export const JPEG_MAX_INSPECTION_BYTES = 32 * 1024 * 1024
const SOI = 0xffd8
const EOI = 0xd9
const APP1 = 0xe1
const APP2 = 0xe2
const COM = 0xfe

function ascii(bytes: Uint8Array, start: number, length: number) {
  return new TextDecoder().decode(bytes.slice(start, start + length))
}

function field(id: string, label: string, category: MetadataField['category'], value: string, classification: MetadataField['classification'] = 'UNKNOWN'): MetadataField {
  return { id, label, category, value, classification }
}

function exifFields(payload: Uint8Array): MetadataField[] {
  const fields: MetadataField[] = [field('exif-present', 'EXIF metadata', 'EXIF', 'Present', 'UNKNOWN')]
  if (payload.length >= 14) {
    const little = payload[6] === 0x49 && payload[7] === 0x49
    const big = payload[6] === 0x4d && payload[7] === 0x4d
    if (little || big) fields.push(field('exif-byte-order', 'EXIF byte order', 'EXIF', little ? 'Little endian' : 'Big endian', 'PROTECTED'))
    else fields.push(field('exif-structure', 'EXIF structure', 'EXIF', 'Unrecognized TIFF byte order', 'UNKNOWN'))
  }
  return fields
}

function inspectSegments(bytes: Uint8Array): BoundaryResult<readonly MetadataField[]> {
  if (bytes.length < 2 || (bytes[0] << 8 | bytes[1]) !== SOI) return { ok: false, error: { code: 'UNSUPPORTED', message: 'Input is not a JPEG stream.' } }
  const fields: MetadataField[] = []
  let offset = 2
  let sawEoi = false
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Malformed JPEG marker prefix.' } }
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    if (offset >= bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Truncated JPEG marker.' } }
    const marker = bytes[offset++]
    if (marker === 0x00) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Invalid JPEG marker.' } }
    if (marker === EOI) { sawEoi = true; break }
    if (marker >= 0xd0 && marker <= 0xd9) continue
    if (offset + 2 > bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Truncated JPEG segment length.' } }
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'JPEG segment exceeds input bounds.' } }
    const payloadStart = offset + 2
    const payload = bytes.slice(payloadStart, offset + length)
    if (marker === APP1 && ascii(payload, 0, 6) === 'Exif\0\0') fields.push(...exifFields(payload))
    else if (marker === APP1 && ascii(payload, 0, 29).startsWith('http://ns.adobe.com/xap/1.0/')) fields.push(field('xmp-present', 'XMP metadata', 'XMP', 'Present', 'UNKNOWN'))
    else if (marker === APP2 && ascii(payload, 0, 12) === 'ICC_PROFILE\0') fields.push(field('icc-profile', 'ICC color profile', 'other', 'Present', 'PROTECTED'))
    else if (marker === COM) fields.push(field(`comment-${fields.length}`, 'JPEG comment', 'other', `Present (${payload.length} bytes)`, 'UNKNOWN'))
    offset += length
  }
  if (!sawEoi) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'JPEG stream has no EOI marker.' } }
  return { ok: true, value: fields }
}

export async function inspectJpeg(input: LocalInput): Promise<BoundaryResult<InspectionResult>> {
  const descriptor = input.descriptor
  if (descriptor.size !== undefined && descriptor.size > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the inspection size limit.' } }
  const bytes = await input.read(undefined)
  if (!bytes.ok) return bytes
  if (bytes.value.byteLength > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the inspection size limit.' } }
  const parsed = inspectSegments(bytes.value)
  if (!parsed.ok) return parsed
  return { ok: true, value: { kind: 'inspection', status: 'success', input: { filename: descriptor.filename, mimeType: descriptor.mimeType, size: descriptor.size ?? bytes.value.byteLength }, format: { extension: descriptor.filename.split('.').pop()?.toLowerCase(), mimeType: 'image/jpeg', state: 'supported' }, fields: parsed.value, warnings: parsed.value.length ? [] : ['No supported metadata segments were found.'], analyzed: true } }
}

export const jpegAdapter: FormatAdapter & { inspect: typeof inspectJpeg } = {
  id: 'jpeg-inspection',
  capability: { extensions: ['jpg', 'jpeg'], mimeTypes: ['image/jpeg'], operations: ['inspect'] },
  inspect: inspectJpeg,
}
