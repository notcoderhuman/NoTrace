import { strict as assert } from 'node:assert'
import { classifyRequestedFields, canEdit, canRemove, preserveWhenUncertain } from './classification/policy'
import { createFormatAdapterRegistry, type FormatAdapter } from './adapters/registry'
import { createDescriptorInput, createMemoryInput } from './domain/input'
import { inspectJpeg, jpegAdapter } from './adapters/jpeg'
import { createNoopBoundary } from '../local-boundary/noop-boundary'
import type { MetadataField, SafetyClassification } from './domain/metadata'
import { canAuthorizeRemoval, validateRemovalApproval } from './classification/policy'
import { phaseOneSafetyPolicy } from './classification/safety-policy'
import type { RemovalTarget } from './domain/operation'
import { JPEG_PROCESSING_IDENTITY } from './domain/identity'

const input = createDescriptorInput({ id: 'test', filename: 'photo.jpg', source: 'opaque', mimeType: 'image/jpeg', size: 100 })

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => console.log(`PASS ${name}`))
}

async function main() {
  await test('input preserves descriptor without implying parsing', async () => {
    assert.equal(input.descriptor.filename, 'photo.jpg')
    assert.equal(input.descriptor.mimeType, 'image/jpeg')
    const bytes = await input.read()
    assert.equal(bytes.ok, false)
    if (!bytes.ok) assert.equal(bytes.error.code, 'UNSUPPORTED')
  })

  await test('all safety classifications fail closed', () => {
    const classifications: SafetyClassification[] = ['SAFE_TO_REMOVE', 'EDITABLE', 'PROTECTED', 'UNKNOWN', 'UNSUPPORTED']
    assert.deepEqual(classifications.map(canRemove), [true, false, false, false, false])
    assert.deepEqual(classifications.map(canEdit), [false, true, false, false, false])
    assert.deepEqual(classifications.map(preserveWhenUncertain), [false, false, true, true, true])
    const fields: MetadataField[] = classifications.map((classification, index) => ({ id: String(index), label: String(index), category: 'other', classification }))
    const result = classifyRequestedFields(fields, fields.map(field => field.id))
    assert.deepEqual(result.removableFieldIds, ['0'])
    assert.deepEqual(result.preservedFieldIds, ['1', '2', '3', '4'])
  })

  await test('adapter registry registers and resolves by extension and MIME', () => {
    const registry = createFormatAdapterRegistry()
    const adapter: FormatAdapter = { id: 'jpeg-placeholder', capability: { extensions: ['jpg'], mimeTypes: ['image/jpeg'], operations: ['inspect'] } }
    assert.equal(registry.register(adapter).ok, true)
    const duplicate = registry.register(adapter)
    assert.equal(duplicate.ok, false)
    assert.equal(registry.resolve(input.descriptor, 'inspect').ok, true)
    assert.equal(registry.resolve({ ...input.descriptor, filename: 'photo.bin', mimeType: 'image/jpeg' }, 'inspect').ok, true)
    assert.equal(registry.resolve(input.descriptor, 'remove').ok, false)
    assert.equal(registry.resolve({ ...input.descriptor, filename: 'photo.bin', mimeType: 'application/octet-stream' }, 'inspect').ok, false)
  })

  await test('no-op boundary never reports fake metadata', async () => {
    const boundary = createNoopBoundary()
    const inspection = await boundary.inspect(input)
    assert.equal(inspection.ok, true)
    if (inspection.ok) {
      assert.equal(inspection.value.analyzed, false)
      assert.equal(inspection.value.fields.length, 0)
      assert.equal(inspection.value.status, 'unsupported')
    }
    const plan = await boundary.planRemoval({ input, fieldIds: ['gps'], policy: 'quick' })
    assert.equal(plan.ok, true)
    if (plan.ok) { assert.deepEqual(plan.value.removableFieldIds, []); assert.equal(plan.value.requiresApproval, true) }
  })

  await test('no-op boundary returns typed unsupported execution and verification', async () => {
    const boundary = createNoopBoundary()
    const execution = await boundary.execute({ operation: 'remove', input })
    assert.equal(execution.ok, false)
    if (!execution.ok) assert.equal(execution.error.code, 'UNSUPPORTED')
    const verification = await boundary.verify(input)
    assert.equal(verification.ok, true)
    if (verification.ok) {
      assert.equal(verification.value.status, 'unsupported')
      assert.equal(verification.value.outputCreated, false)
    }
    const invalid = await boundary.inspect(createDescriptorInput({ id: 'invalid', filename: ' ', source: 'opaque' }))
    assert.equal(invalid.ok, false)
    if (!invalid.ok) assert.equal(invalid.error.code, 'INVALID_INPUT')
  })

  await test('Phase 1 core has no network/UI dependencies', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const roots = [path.resolve('lib/processing-core'), path.resolve('lib/local-boundary')]
    const files: string[] = []
    async function walk(dir: string) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) await walk(full)
        else if (full.endsWith('.ts') && !full.endsWith('phase1-contract.test.ts')) files.push(full)
      }
    }
    for (const root of roots) await walk(root)
    const source = (await Promise.all(files.map(file => fs.readFile(file, 'utf8')))).join('\n')
    for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'from \'react\'', 'from \'next/']) {
      const found = source.includes(forbidden) && !source.includes(`'${forbidden}`)
      assert.equal(found, false, forbidden)
    }
  })

  await test('JPEG signature and deterministic empty inspection', async () => {
    const empty = await inspectJpeg(createMemoryInput(new Uint8Array(), { id: 'empty', filename: 'empty.jpg' }))
    assert.equal(empty.ok, false)
    const minimal = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x11, 0xff, 0xd9])
    const result = await inspectJpeg(createMemoryInput(minimal, { id: 'minimal', filename: 'not-a-jpeg.bin' }))
    assert.equal(result.ok, true)
    if (result.ok) { assert.equal(result.value.analyzed, true); assert.equal(result.value.status, 'success') }
  })

  await test('JPEG EXIF, XMP, comment, ICC and multiple segments', async () => {
    const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
    const exif = [...new TextEncoder().encode('Exif\0\0'), 0x49, 0x49]
    const xmp = [...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0<xml/>')]
    const icc = [...new TextEncoder().encode('ICC_PROFILE\0\x01\x01')]
    const comment = [...new TextEncoder().encode('hello')]
    const frame = [0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0]
    const scan = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0]
    const bytes = new Uint8Array([0xff, 0xd8, ...frame, ...segment(0xe1, exif), ...segment(0xe1, xmp), ...segment(0xe2, icc), ...segment(0xfe, comment), ...scan, 0x11, 0xff, 0xd9])
    const result = await inspectJpeg(createMemoryInput(bytes, { id: 'metadata', filename: 'metadata.jpg' }))
    assert.equal(result.ok, true)
    if (result.ok) assert.deepEqual(result.value.fields.map(field => field.category), ['EXIF', 'XMP', 'other', 'other'])
  })

  await test('JPEG malformed and oversized inputs fail safely', async () => {
    const malformed = [new Uint8Array([0xff]), new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01]), new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x01, 0x02])]
    for (const bytes of malformed) { const result = await inspectJpeg(createMemoryInput(bytes, { id: 'bad', filename: 'bad.jpg' })); assert.equal(result.ok, false) }
    const oversized = createMemoryInput(new Uint8Array(32 * 1024 * 1024 + 1), { id: 'large', filename: 'large.jpg' })
    const result = await inspectJpeg(oversized)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, 'LIMIT_EXCEEDED')
  })

  await test('removal policy authorizes only structural COM targets', () => {
    const target: RemovalTarget = { id: 'jpeg-com-0', kind: 'jpeg-segment', marker: 0xfe, ordinal: 0, startOffset: 2, endOffset: 7, category: 'comment', scope: 'jpeg-com', classification: 'SAFE_TO_REMOVE', removable: true, reason: 'Recognized comment segment.' }
    assert.equal(canAuthorizeRemoval(target, phaseOneSafetyPolicy), true)
    assert.equal(phaseOneSafetyPolicy.preserveOriginal, true)
    assert.equal(phaseOneSafetyPolicy.failClosed, true)
    assert.equal(phaseOneSafetyPolicy.retainInMemoryOnly, true)
    const plan = { id: 'plan-1', status: 'ready' as const, identity: JPEG_PROCESSING_IDENTITY, input: input.descriptor, sourceFingerprint: 'fingerprint', targets: [target], removableTargetIds: [target.id], preservedTargetIds: [], warnings: [], requiresApproval: true as const, removableFieldIds: [], preservedFieldIds: [], removalWitnesses: [] }
    assert.equal(validateRemovalApproval({ planId: 'plan-1', inputId: 'test', sourceFingerprint: 'fingerprint', identity: JPEG_PROCESSING_IDENTITY, approvedTargetIds: [target.id], approvedAt: 1 }, plan), true)
    assert.equal(validateRemovalApproval({ planId: 'stale', inputId: 'test', sourceFingerprint: 'fingerprint', identity: JPEG_PROCESSING_IDENTITY, approvedTargetIds: [target.id], approvedAt: 1 }, plan), false)
    assert.equal(validateRemovalApproval({ planId: 'plan-1', inputId: 'other', sourceFingerprint: 'fingerprint', identity: JPEG_PROCESSING_IDENTITY, approvedTargetIds: [target.id], approvedAt: 1 }, plan), false)
  })

  await test('JPEG registry exposes inspection and plan-only removal', () => {
    const registry = createFormatAdapterRegistry()
    assert.equal(registry.register(jpegAdapter).ok, true)
    assert.equal(registry.resolveInspection(input.descriptor).ok, true)
    assert.equal(registry.resolve(input.descriptor, 'remove').ok, true)
    assert.deepEqual(jpegAdapter.capability.operations, ['inspect', 'remove'])
  })

  console.log('Phase 1/2 contract tests passed: 10')
}

void main()
