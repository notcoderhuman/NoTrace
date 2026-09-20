import { strict as assert } from 'node:assert'
import { createMemoryInput } from '../domain/input'
import { scanPng, inspectPng, planPngRemoval, PNG_SIGNATURE, PNG_SCOPE } from './png'
import { canAuthorizeRemoval } from '../classification/policy'

function crc(bytes: Uint8Array) { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0) }; return (c ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: number[]) { const t = new TextEncoder().encode(type); const body = new Uint8Array([...t, ...data]); const out = new Uint8Array(12 + data.length); new DataView(out.buffer).setUint32(0, data.length); out.set(t, 4); out.set(data, 8); new DataView(out.buffer).setUint32(8 + data.length, crc(body)); return [...out] }
const ihdrBytes = chunk('IHDR', [0,0,0,1,0,0,0,1,8,2,0,0,0])
const idat = chunk('IDAT', [0, 0, 0, 0])
const iend = chunk('IEND', [])
const text = chunk('tEXt', [...new TextEncoder().encode('Comment'), 0, ...new TextEncoder().encode('hello')])
const png = (...chunks: number[]) => new Uint8Array([...PNG_SIGNATURE, ...chunks])
function ihdr(color: number) { return chunk('IHDR', [0,0,0,1,0,0,0,1, color === 3 ? 8 : 8, color, 0,0,0]) }
function withPalette(color: number, entry4Red: number) { return png(...ihdr(color), ...chunk('PLTE', [1,2,3,4,5,6,7,8,entry4Red,10,11,12]), ...idat, ...iend) }
async function main() {
  const bytes = png(...ihdrBytes, ...text, ...idat, ...iend)
  const input = createMemoryInput(bytes, { id: 'png-test', filename: 'fixture.png', mimeType: 'image/png' })
  const scanned = await scanPng(input); assert.equal(scanned.ok, true, scanned.ok ? '' : scanned.error.message); if (!scanned.ok) return
  assert.deepEqual(scanned.value.chunks.map(c => c.id), ['png-IHDR-0', 'png-tEXt-0', 'png-IDAT-0', 'png-IEND-0'])
  const inspected = await inspectPng(input); assert.equal(inspected.ok, true); if (!inspected.ok) return
  const target = scanned.value.chunks.find(c => c.type === 'tEXt')!
  assert.equal(canAuthorizeRemoval({ ...target, formatId: 'png', typeId: target.typeId, kind: 'format-target', marker: 0, category: 'unknown', scope: PNG_SCOPE, classification: 'SAFE_TO_REMOVE', removable: true, reason: 'test' }, { maxInputBytes: 1, maxOutputBytes: 1, maxFiles: 1, maxSegments: 10, maxMetadataSegmentBytes: 100, maxTotalMetadataBytes: 100, allowedOperations: ['remove'], allowedRemovalScopes: [PNG_SCOPE], allowOutput: true, preserveOriginal: true, failClosed: true, retainInMemoryOnly: true, preserveProtectedSegments: true, preserveUnknownSegments: true, requireIndependentVerification: true }), true)
  const plan = await planPngRemoval(input, [target.id], 'png-text'); assert.equal(plan.ok, true); if (!plan.ok) return; assert.deepEqual(plan.value.removableTargetIds, [target.id])
  const malformed = createMemoryInput(new Uint8Array([1,2,3]), { id: 'bad', filename: 'bad.png', mimeType: 'image/png' }); const rejected = await scanPng(malformed); assert.equal(rejected.ok, false)
  for (const color of [0, 4]) assert.equal((await scanPng(createMemoryInput(withPalette(color, 0), { id: `gray-${color}`, filename: 'x.png', mimeType: 'image/png' }))).ok, false)
  for (const color of [3, 2, 6]) { assert.equal((await scanPng(createMemoryInput(withPalette(color, 0), { id: `valid-${color}`, filename: 'x.png', mimeType: 'image/png' }))).ok, true); if (color === 3) assert.equal((await scanPng(createMemoryInput(withPalette(color, 4), { id: 'indexed-r4', filename: 'x.png', mimeType: 'image/png' }))).ok, true) }
  assert.equal((await scanPng(createMemoryInput(png(...ihdr(3), ...idat, ...iend), { id: 'missing-plte', filename: 'x.png', mimeType: 'image/png' }))).ok, false)
  console.log('PNG adapter structural tests passed: 9')
}
void main()
