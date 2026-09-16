import { strict as assert } from 'node:assert'
import { createMemoryArtifact } from './artifact'
import { transitionOwnedArtifact } from './ownership'

const artifact = createMemoryArtifact(new Uint8Array([1]), 'a.jpg')
const created = { artifact, state: 'CREATED' as const }
const execution = transitionOwnedArtifact(created, 'EXECUTION_OWNED')
assert.equal(execution.ok, true)
if (execution.ok) {
  const verified = transitionOwnedArtifact(execution.value, 'VERIFIED'); assert.equal(verified.ok, true)
  if (verified.ok) {
    const transferred = transitionOwnedArtifact(verified.value, 'TRANSFERRED'); assert.equal(transferred.ok, true)
    if (transferred.ok) {
      assert.equal(transitionOwnedArtifact(transferred.value, 'TRANSFERRED').ok, false)
      const provider = transitionOwnedArtifact(transferred.value, 'PROVIDER_OWNED'); assert.equal(provider.ok, true)
      if (provider.ok) {
        const disposed = transitionOwnedArtifact(provider.value, 'DISPOSED'); assert.equal(disposed.ok, true)
        if (disposed.ok) {
          assert.equal(transitionOwnedArtifact(disposed.value, 'TRANSFERRED').ok, false)
          assert.equal(transitionOwnedArtifact(disposed.value, 'PROVIDER_OWNED').ok, false)
        }
      }
    }
  }
}
assert.equal(transitionOwnedArtifact(created, 'PROVIDER_OWNED').ok, false)
console.log('Ownership FSM tests passed: 7')
