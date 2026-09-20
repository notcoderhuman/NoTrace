import { strict as assert } from 'node:assert'
import { createMemoryArtifact, disposeArtifact, type OutputArtifact } from './artifact'
import { transitionOwnedArtifact, type OwnedArtifact } from './ownership'

async function main() {
  const artifact = createMemoryArtifact(new Uint8Array([1, 2]), 'verified.jpg')
  assert.equal(disposeArtifact(artifact).ok, true)
  assert.equal(disposeArtifact(artifact).ok, true)
  assert.equal((await artifact.read()).ok, false)

  let disposals = 0
  const throwing: OutputArtifact = {
    id: 'throwing', filename: 'throwing.jpg', size: 0,
    async read() { return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'unavailable' } } },
    dispose() { disposals += 1; throw new Error('cleanup failure') },
  }
  const cleanup = disposeArtifact(throwing)
  assert.equal(cleanup.ok, false)
  assert.equal(disposals, 1)
  assert.equal(disposeArtifact(throwing).ok, true)
  assert.equal(disposals, 1)
  const owned: OwnedArtifact = { artifact, state: 'CREATED' }
  assert.equal(transitionOwnedArtifact(owned, 'PROVIDER_OWNED').ok, false)
  assert.equal(transitionOwnedArtifact(owned, 'EXECUTION_OWNED').ok, true)
  console.log('Artifact lifecycle tests passed: 4')
}
void main()
