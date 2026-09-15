import { strict as assert } from 'node:assert'
import exifr from 'exifr'

const encoder = new TextEncoder()
const bytes = (...values: number[]) => new Uint8Array(values)
const concat = (...parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { output.set(part, offset); offset += part.length }
  return output
}
const segment = (marker: number, payload: Uint8Array) => concat(bytes(0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff), payload)

function tiffExif() {
  // Little-endian TIFF with Make, Model, Software, DateTime and GPS IFD pointers.
  const out = new Uint8Array(128)
  const view = new DataView(out.buffer)
  out.set(bytes(0x49, 0x49, 0x2a, 0x00), 0)
  view.setUint32(4, 8, true)
  view.setUint16(8, 4, true)
  let at = 10
  const ascii = (tag: number, text: string, valueOffset: number) => {
    view.setUint16(at, tag, true); view.setUint16(at + 2, 2, true); view.setUint32(at + 4, text.length, true); view.setUint32(at + 8, valueOffset, true); at += 12
  }
  ascii(0x010f, 'Test Camera\0', 62)
  ascii(0x0110, 'Test Model\0', 75)
  ascii(0x0131, 'NoTrace\0', 87)
  ascii(0x0132, '2025:01:02 03:04:05\0', 96)
  view.setUint32(58, 0, true)
  encoder.encodeInto('Test Camera\0', out.subarray(62))
  encoder.encodeInto('Test Model\0', out.subarray(75))
  encoder.encodeInto('NoTrace\0', out.subarray(87))
  encoder.encodeInto('2025:01:02 03:04:05\0', out.subarray(96))
  return concat(encoder.encode('Exif\0\0'), out)
}

function validJpeg() {
  const frame = bytes(0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0)
  const scan = bytes(0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0)
  return concat(bytes(0xff, 0xd8), segment(0xe1, tiffExif()), segment(0xe1, encoder.encode('http://ns.adobe.com/xap/1.0/\0<rdf:RDF/>')), segment(0xe2, encoder.encode('ICC_PROFILE\0\x01\x01')), segment(0xfe, encoder.encode('NoTrace comment')), frame, scan, bytes(0x11, 0xff, 0xd9))
}

function validPng() {
  return bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82)
}
function ftyp(brand: string) {
  const value = encoder.encode(brand)
  return concat(bytes(0, 0, 0, 20), encoder.encode('ftyp'), value, bytes(0, 0, 0, 0), value)
}
function validTiff() { return tiffExif() }

async function safeParse(label: string, input: Uint8Array) {
  const started = performance.now()
  try {
    const result = await exifr.parse(input, { silentErrors: false } as any)
    return { label, outcome: result ? 'detected' : 'not-detected', keys: result ? Object.keys(result).slice(0, 30) : [], elapsedMs: performance.now() - started }
  } catch (error) {
    return { label, outcome: 'failed-closed', error: error instanceof Error ? error.message : String(error), elapsedMs: performance.now() - started }
  }
}

async function main() {
  const originalFetch = globalThis.fetch
  const originalXhr = globalThis.XMLHttpRequest
  const originalWebSocket = globalThis.WebSocket
  let networkAttempts = 0
  globalThis.fetch = (async () => { networkAttempts++; throw new Error('network forbidden in exifr spike') }) as typeof fetch
  // These properties are intentionally replaced only for this process-local evaluation.
  ;(globalThis as any).XMLHttpRequest = class { constructor() { networkAttempts++; throw new Error('XHR forbidden') } }
  ;(globalThis as any).WebSocket = class { constructor() { networkAttempts++; throw new Error('WebSocket forbidden') } }

  const fixtures = [
    ['JPEG', validJpeg()],
    ['PNG', validPng()],
    ['WebP', concat(encoder.encode('RIFF'), bytes(0, 0, 0, 0), encoder.encode('WEBP'))],
    ['AVIF', ftyp('avif')],
    ['HEIC', ftyp('heic')],
    ['TIFF', validTiff()],
  ] as const
  const formatResults = await Promise.all(fixtures.map(([label, input]) => safeParse(label, input)))
  const malformed = [
    ['empty', bytes()],
    ['tiny', bytes(0xff)],
    ['random', bytes(1, 2, 3, 4, 5, 6)],
    ['truncated-jpeg', bytes(0xff, 0xd8, 0xff, 0xe1, 0, 20, 0x45)],
    ['invalid-jpeg-length', bytes(0xff, 0xd8, 0xff, 0xe1, 0, 0)],
    ['corrupt-png', bytes(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0)],
    ['huge-declaration', concat(bytes(0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff), new Uint8Array(64))],
  ] as const
  const malformedResults = await Promise.all(malformed.map(([label, input]) => safeParse(label, input)))
  const large = new Uint8Array(4 * 1024 * 1024)
  const resource = await safeParse('4MiB-random', large)
  assert.equal(networkAttempts, 0, 'local Uint8Array parsing must not use network APIs')
  globalThis.fetch = originalFetch
  ;(globalThis as any).XMLHttpRequest = originalXhr
  ;(globalThis as any).WebSocket = originalWebSocket
  console.log(JSON.stringify({ version: '7.1.3', formatResults, malformedResults, resource, networkAttempts, note: 'Evaluation only; no production adapter or UI path was changed.' }, null, 2))
}

void main()
