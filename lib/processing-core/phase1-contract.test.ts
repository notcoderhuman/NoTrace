import { strict as assert } from 'node:assert'
import { classifyRequestedFields, canEdit, canRemove, preserveWhenUncertain } from './classification/policy'
import { createFormatAdapterRegistry, type FormatAdapter } from './adapters/registry'
import { createDescriptorInput } from './domain/input'
import { createNoopBoundary } from '../local-boundary/noop-boundary'
import type { MetadataField, SafetyClassification } from './domain/metadata'

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
    if (plan.ok) assert.deepEqual(plan.value.removableFieldIds, [])
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

  console.log('Phase 1 contract tests passed: 6')
}

void main()
