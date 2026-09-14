import { strict as assert } from 'node:assert'
import { createMemoryInput } from '../domain/input'
import { inspectJpegStructure, JPEG_MAX_SEGMENTS } from './jpeg'

const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const text = (value: string) => [...new TextEncoder().encode(value)]
const frame = [0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0]
const scan = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0]
const jpeg = (...parts: number[]) => new Uint8Array([0xff, 0xd8, ...frame, ...scan, ...parts, 0xff, 0xd9])

async function test(name: string, fn: () => void | Promise<void>) { await fn(); console.log(`PASS ${name}`) }

async function main() {
  await test('structural IDs and ordering are deterministic', async () => {
    const bytes = jpeg(...segment(0xfe, text('a')), ...segment(0xfe, text('b')), ...segment(0xe1, [...text('Exif\0\0'), 0x49, 0x49]), ...segment(0xe2, [...text('ICC_PROFILE\0'), 1]))
    const result = await inspectJpegStructure(createMemoryInput(bytes, { id: 'x', filename: 'x.jpg' }))
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepEqual(result.value.segments.map(segment => segment.target?.id).filter(Boolean), ['jpeg-comment-0', 'jpeg-comment-1', 'jpeg-exif-0', 'jpeg-icc-0'])
      assert.deepEqual(result.value.segments.map(segment => segment.kind), ['soi', 'image', 'image', 'comment', 'comment', 'exif', 'icc', 'eoi'])
    }
  })
  await test('parses SOS entropy, stuffing, and restart markers without exposing image bytes as targets', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, ...frame, ...segment(0xfe, text('one')), ...segment(0xfe, text('two')), ...scan, 0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd0, 0x44, 0xff, 0x00, 0x55, 0xff, 0xd7, 0x66, 0xff, 0xd9])
    const result = await inspectJpegStructure(createMemoryInput(bytes, { id: 'entropy', filename: 'entropy.jpg' }))
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.deepEqual(result.value.segments.map(segment => segment.kind), ['soi', 'image', 'comment', 'comment', 'image', 'eoi'])
      assert.deepEqual(result.value.segments.map(segment => segment.target?.id).filter(Boolean), ['jpeg-comment-0', 'jpeg-comment-1'])
      const image = result.value.segments.find(segment => segment.kind === 'image' && segment.marker === 0xda)
      assert.equal(image?.marker, 0xda)
      assert.equal(image?.endOffset, bytes.length - 2)
      assert.equal(image?.payloadLength, 6)
    }
  })
  await test('recognized targets are non-removable except policy-ready COM', async () => {
    const bytes = jpeg(...segment(0xfe, text('a')), ...segment(0xe1, [...text('http://ns.adobe.com/xap/1.0/'), 0]), ...segment(0xe2, [...text('ICC_PROFILE\0'), 1]), ...segment(0xe3, [1]))
    const result = await inspectJpegStructure(createMemoryInput(bytes, { id: 'x', filename: 'x.jpg' }))
    assert.equal(result.ok, true)
    if (result.ok) {
      const targets = result.value.segments.flatMap(segment => segment.target ? [segment.target] : [])
      assert.equal(targets.find(target => target.category === 'comment')?.removable, true)
      assert.equal(targets.find(target => target.category === 'xmp')?.removable, false)
      assert.equal(targets.find(target => target.category === 'icc')?.classification, 'PROTECTED')
      assert.equal(targets.find(target => target.category === 'unknown')?.removable, false)
    }
  })
  await test('rejects arbitrary and duplicate trailing bytes after EOI', async () => {
    const valid = jpeg(...segment(0xfe, text('ok')))
    const accepted = await inspectJpegStructure(createMemoryInput(valid, { id: 'suffix-ok', filename: 'suffix-ok.jpg' }))
    assert.equal(accepted.ok, true)
    for (const suffix of [[0x00], [0xff, 0xd9], [1, 2, 3, 4]]) {
      const rejected = await inspectJpegStructure(createMemoryInput(new Uint8Array([...valid, ...suffix]), { id: 'suffix-bad', filename: 'suffix-bad.jpg' }))
      assert.equal(rejected.ok, false)
      if (!rejected.ok) assert.equal(rejected.error.code, 'PROCESSING_FAILED')
    }
  })
  await test('malformed, missing EOI, oversized metadata, and segment limits fail safely', async () => {
    for (const bytes of [new Uint8Array([0xff]), new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 1])]) {
      const result = await inspectJpegStructure(createMemoryInput(bytes, { id: 'bad', filename: 'bad.jpg' }))
      assert.equal(result.ok, false)
    }
    const noEoi = await inspectJpegStructure(createMemoryInput(new Uint8Array([0xff, 0xd8, ...segment(0xfe, [1])]), { id: 'bad', filename: 'bad.jpg' }))
    assert.equal(noEoi.ok, false)
    const many = [0xff, 0xd8]
    for (let index = 0; index < JPEG_MAX_SEGMENTS; index++) many.push(...segment(0xfe, []))
    many.push(0xff, 0xd9)
    const limited = await inspectJpegStructure(createMemoryInput(new Uint8Array(many), { id: 'many', filename: 'many.jpg' }))
    assert.equal(limited.ok, false)
  })
  await test('input limit and cancellation remain enforced', async () => {
    const large = await inspectJpegStructure(createMemoryInput(new Uint8Array(32 * 1024 * 1024 + 1), { id: 'large', filename: 'large.jpg' }))
    assert.equal(large.ok, false)
    if (!large.ok) assert.equal(large.error.code, 'LIMIT_EXCEEDED')
    const controller = new AbortController(); controller.abort()
    const cancelled = await inspectJpegStructure(createMemoryInput(jpeg(), { id: 'cancel', filename: 'cancel.jpg' }), controller.signal)
    assert.equal(cancelled.ok, false)
    if (!cancelled.ok) assert.equal(cancelled.error.code, 'CANCELLED')
  })
  console.log('JPEG structural inventory tests passed: 6')
}
void main()
