import { strict as assert } from 'node:assert'
import { createBrowserFileInput, createMemoryFileInput } from './browser-input'
import { createDefaultFormatAdapterRegistry } from './default-registry'
import { createInspectionBoundary } from './inspection-boundary'
import { jpegAdapter } from '../processing-core/adapters/jpeg'
import { createFormatAdapterRegistry, type FormatAdapter } from '../processing-core/adapters/registry'

function segment(marker: number, payload: number[]) {
  return [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
}

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, ...segment(0xe1, [...new TextEncoder().encode('Exif\0\0'), 0x49, 0x49]), 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x11, 0xff, 0xd9])

function browserFile(bytes: Uint8Array, name = 'photo.jpg', type = 'image/jpeg') {
  return new File([bytes], name, { type })
}

async function test(name: string, fn: () => void | Promise<void>) {
  await fn()
  console.log(`PASS ${name}`)
}

async function main() {
  await test('browser File preserves identity and reads bounded bytes', async () => {
    const file = browserFile(jpegBytes)
    const input = createBrowserFileInput(file)
    assert.equal(input.descriptor.filename, 'photo.jpg')
    assert.equal(input.descriptor.mimeType, 'image/jpeg')
    assert.equal(input.descriptor.size, jpegBytes.byteLength)
    assert.equal(input.descriptor.source, 'browser-file')
    const bytes = await input.read({ offset: 0, length: 2 })
    assert.equal(bytes.ok, true)
    if (bytes.ok) assert.deepEqual([...bytes.value], [0xff, 0xd8])
    input.release()
    const released = await input.read()
    assert.equal(released.ok, false)
  })

  await test('valid JPEG flows through default registry and inspection boundary', async () => {
    const boundary = createInspectionBoundary(createDefaultFormatAdapterRegistry())
    const result = await boundary.inspect(createMemoryFileInput(jpegBytes, { id: 'memory-jpeg', filename: 'photo.jpg', mimeType: 'application/octet-stream' }))
    assert.equal(result.ok, true)
    if (result.ok) { assert.equal(result.value.analyzed, true); assert.equal(result.value.format.state, 'supported'); assert.equal(result.value.fields[0]?.category, 'EXIF') }
  })

  await test('PNG resolves the production PNG inspection path', async () => {
    const boundary = createInspectionBoundary(createDefaultFormatAdapterRegistry())
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const result = await boundary.inspect(createMemoryFileInput(png, { id: 'png', filename: 'image.png', mimeType: 'image/png' }))
    assert.equal(result.ok, false)
    if (!result.ok) assert.notEqual(result.error.code, 'UNSUPPORTED')
  })

  await test('fake JPEG extension and MIME do not bypass byte validation', async () => {
    const boundary = createInspectionBoundary(createDefaultFormatAdapterRegistry())
    const result = await boundary.inspect(createMemoryFileInput(new Uint8Array([1, 2, 3]), { id: 'fake', filename: 'fake.jpg', mimeType: 'image/jpeg' }))
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, 'UNSUPPORTED')
  })

  await test('oversized browser input is rejected before reading', async () => {
    const boundary = createInspectionBoundary(createDefaultFormatAdapterRegistry())
    const input = createBrowserFileInput(browserFile(new Uint8Array([0xff, 0xd8]), 'large.jpg'), 1)
    const result = await boundary.inspect(input)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, 'LIMIT_EXCEEDED')
  })

  await test('cancellation is honored', async () => {
    const controller = new AbortController()
    controller.abort()
    const input = createBrowserFileInput(browserFile(jpegBytes))
    const read = await input.read(undefined, controller.signal)
    assert.equal(read.ok, false)
    if (!read.ok) assert.equal(read.error.code, 'CANCELLED')
    const boundary = createInspectionBoundary(createDefaultFormatAdapterRegistry())
    const result = await boundary.inspect(input, { signal: controller.signal })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, 'CANCELLED')
  })

  await test('registry rejects inspection capability without inspect function', async () => {
    const registry = createFormatAdapterRegistry()
    const candidate: FormatAdapter = { id: 'candidate', capability: { extensions: ['jpg'], mimeTypes: ['image/jpeg'], operations: ['inspect'] } }
    assert.equal(registry.register(candidate).ok, true)
    assert.equal(registry.resolveInspection({ id: 'x', filename: 'x.jpg', mimeType: 'image/jpeg', source: 'opaque' }).ok, false)
  })

  await test('inspection boundary does not expose execution paths', async () => {
    const boundary = createInspectionBoundary(createDefaultFormatAdapterRegistry())
    const input = createMemoryFileInput(jpegBytes, { id: 'jpeg', filename: 'x.jpg' })
    const execution = await boundary.execute({ operation: 'remove', input })
    const plan = await boundary.planRemoval({ input, fieldIds: ['x'], policy: 'none' })
    const verification = await boundary.verify(input)
    assert.equal(execution.ok, false)
    assert.equal(plan.ok, false)
    assert.equal(verification.ok, false)
    if (!execution.ok) assert.equal(execution.error.code, 'UNSUPPORTED')
    if (!plan.ok) assert.equal(plan.error.code, 'UNSUPPORTED')
    if (!verification.ok) assert.equal(verification.error.code, 'UNSUPPORTED')
  })

  await test('core boundary sources contain no network/filesystem/UI imports', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const roots = [path.resolve('lib/processing-core'), path.resolve('lib/local-boundary')]
    const files: string[] = []
    async function walk(dir: string) { for (const entry of await fs.readdir(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) await walk(full); else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) files.push(full) } }
    for (const root of roots) await walk(root)
    const source = (await Promise.all(files.map(file => fs.readFile(file, 'utf8')))).join('\n')
    for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'node:fs', 'from \'react\'', 'from \'next/']) assert.equal(source.includes(forbidden), false, forbidden)
  })

  assert.deepEqual(jpegAdapter.capability.operations, ['inspect', 'remove'])
  console.log('Phase 3A inspection tests passed: 8')
}

void main()
