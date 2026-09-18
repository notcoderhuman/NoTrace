import { strict as assert } from 'node:assert'
import { isEvidenceRecord, isStaticCapabilityDeclaration, type EvidenceRecord, type StaticCapabilityDeclaration } from './contracts'

const jpeg: StaticCapabilityDeclaration = {
  formatId: 'jpeg',
  operations: ['inspect', 'planRemoval', 'executeRemoval', 'verifyRemoval'],
  extensions: ['jpg', 'jpeg'],
  mimeTypes: ['image/jpeg'],
  verifierCompatibilityKey: 'notrace-jpeg-com-v1',
}

assert.equal(isStaticCapabilityDeclaration(jpeg), true)
assert.equal(isStaticCapabilityDeclaration({ ...jpeg, formatId: '' }), false)
assert.equal(isStaticCapabilityDeclaration({ formatId: 'png', operations: [], extensions: [], mimeTypes: [] }), false)

const evidence: EvidenceRecord = {
  id: 'jpeg-comment-0',
  label: 'JPEG comment',
  category: 'comment',
  state: 'detected',
  safety: 'safe-to-remove',
  explanation: 'Recognized structural JPEG COM segment.',
  source: 'local-inspection',
  targetId: 'jpeg-comment-0',
  location: { kind: 'range', start: 10, end: 22 },
  confidence: 'high',
}
assert.equal(isEvidenceRecord(evidence), true)
assert.equal(isEvidenceRecord({ ...evidence, state: 'absent' }), false)
assert.equal(isEvidenceRecord({ ...evidence, safety: 'safe' }), false)

console.log('Core contract declarations passed: 6')
