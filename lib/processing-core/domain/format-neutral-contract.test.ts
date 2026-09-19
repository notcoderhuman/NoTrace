import { strict as assert } from 'node:assert'
import { isEvidenceRecord, isStaticCapabilityDeclaration, type EvidenceRecord, type StaticCapabilityDeclaration } from './contracts'
import type { RemovalTarget } from './operation'
import { canAuthorizeRemoval } from '../classification/policy'
import { phaseOneSafetyPolicy } from '../classification/safety-policy'

const pngDeclaration: StaticCapabilityDeclaration = {
  formatId: 'png', operations: ['inspect', 'planRemoval', 'executeRemoval', 'verifyRemoval'], extensions: ['png'], mimeTypes: ['image/png'], verifierCompatibilityKey: 'notrace-png-v1', verificationCheckIds: ['png-structure', 'text-chunk-absent'],
}
const pngTarget: RemovalTarget = { id: 'png-text-0', formatId: 'png', typeId: 'tEXt', kind: 'format-target', marker: 0, ordinal: 0, startOffset: 8, endOffset: 32, category: 'comment', scope: { formatId: 'png', scopeId: 'png-text' }, classification: 'SAFE_TO_REMOVE', removable: true, reason: 'Hypothetical PNG text chunk.' }
const pngEvidence: EvidenceRecord = { id: 'png-text-0', label: 'PNG text chunk', category: 'text', state: 'detected', safety: 'safe-to-remove', targetId: pngTarget.id, explanation: 'Repeated PNG text chunk.', source: 'simulated-fixture', confidence: 'high' }
assert.equal(isStaticCapabilityDeclaration(pngDeclaration), true)
assert.equal(isEvidenceRecord(pngEvidence), true)
assert.equal(canAuthorizeRemoval(pngTarget, phaseOneSafetyPolicy), false)
assert.equal(isEvidenceRecord({ ...pngEvidence, state: 'unknown' }), false)
assert.equal(isEvidenceRecord({ ...pngEvidence, parserPrivate: true } as unknown), false)
const jpegTarget: RemovalTarget = { ...pngTarget, id: 'jpeg-comment-0', formatId: 'jpeg', typeId: 'jpeg-marker-fe', scope: { formatId: 'jpeg', scopeId: 'jpeg-com' } }
assert.equal(canAuthorizeRemoval(jpegTarget, phaseOneSafetyPolicy), true)
assert.equal(canAuthorizeRemoval({ ...jpegTarget, scope: { formatId: 'png', scopeId: 'jpeg-com' } }, phaseOneSafetyPolicy), false)
console.log('Format-neutral contract fixture tests passed: 7')
