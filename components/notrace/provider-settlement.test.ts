import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createMemoryFileInput } from '@/lib/local-boundary/browser-input'
import { createDefaultFormatAdapterRegistry } from '@/lib/local-boundary/default-registry'
import { createPlanningBoundary } from '@/lib/local-boundary/planning-boundary'
import { createProcessingBoundary } from '@/lib/local-boundary/processing-boundary'
import { createArtifactOwnershipController, createRemovalLifecycleController, settleRemovalCompletion } from './provider'

async function main() {
  const bytes = readFileSync('e2e/fixtures/removable.jpg')
  const input = createMemoryFileInput(bytes, { id: 'settlement-input', filename: 'removable.jpg', mimeType: 'image/jpeg' })
  const planning = createPlanningBoundary(createDefaultFormatAdapterRegistry())
  const initial = await planning.planRemoval({ input, fieldIds: [], policy: 'jpeg-com' })
  assert.equal(initial.ok, true)
  if (!initial.ok) return
  const ids = initial.value.targets.filter(target => target.category === 'comment' && target.removable && target.classification === 'SAFE_TO_REMOVE').map(target => target.id)
  const planned = await planning.planRemoval({ input, fieldIds: ids, policy: 'jpeg-com' })
  assert.equal(planned.ok, true)
  if (!planned.ok) return
  const approval = { planId: planned.value.id, inputId: input.descriptor.id, sourceFingerprint: planned.value.sourceFingerprint, identity: planned.value.identity, approvedTargetIds: ids.slice(0, 1), approvedAt: Date.now() }
  const result = await createProcessingBoundary(createDefaultFormatAdapterRegistry()).execute({ operation: 'remove', input, plan: planned.value, approval })
  assert.equal(result.ok, true)
  if (!result.ok) return
  const lifecycle = createRemovalLifecycleController()
  const operation = lifecycle.begin('file', input.descriptor.id)
  const completion = settleRemovalCompletion({ lifecycle, ownership: createArtifactOwnershipController(), operation, fileId: 'file', inputId: input.descriptor.id, requestId: operation.generation, selectedId: 'file', currentInput: input, expectedInput: input, expectedPlan: planned.value, expectedApproval: approval, result })
  assert.equal(completion.kind, 'success')
  console.log('PASS provider settlement accepts single-target verified output with plan-preserved targets')
}
void main()
