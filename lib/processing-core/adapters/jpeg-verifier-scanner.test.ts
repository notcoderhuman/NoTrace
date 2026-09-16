import { strict as assert } from 'node:assert'
import { scanJpegForVerification } from './jpeg-verifier-scanner'

const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
const source = new Uint8Array([0xff, 0xd8, ...segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]), ...segment(0xfe, [1, 2]), ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33, 0xff, 0xd9])

function main() {
  const valid = scanJpegForVerification(source)
  assert.equal(valid.ok, true)
  if (valid.ok) {
    assert.equal(valid.value.comRecords.length, 1)
    assert.equal(valid.value.records.some(record => record.kind === 'scan'), true)
    assert.equal(valid.value.records.at(-1)?.kind, 'eoi')
  }
  assert.equal(scanJpegForVerification(new Uint8Array([...source, 0])).ok, false)
  assert.equal(scanJpegForVerification(new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0, 1])).ok, false)
  assert.equal(scanJpegForVerification(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 2, 0xff, 0xd9])).ok, false)
  const aborted = new AbortController(); aborted.abort(); const cancelled = scanJpegForVerification(source, aborted.signal)
  assert.equal(cancelled.ok, false); if (!cancelled.ok) assert.equal(cancelled.error.code, 'CANCELLED')
  console.log('Independent JPEG verifier scanner tests passed: 5')
}
main()
