import { strict as assert } from 'node:assert'
import { metadata, sampleFile } from '../notrace-demo'
import { mapDemoFile, mapDemoFindings, mapDemoReport } from './demo-mapper'
import { mapRealFile, mapRealProgress, mapRealRemoval, mapRealRisk, mapRealVerification } from './real-mapper'
import type { ReportViewModel, UnifiedFileViewModel } from './models'
import { scoreRisk } from './risk-scoring'

const demo: UnifiedFileViewModel = mapDemoFile(sampleFile)
const real: UnifiedFileViewModel = mapRealFile({ id: 'same', filename: sampleFile.name, mimeType: 'image/jpeg' })
assert.equal(demo.source, 'demo')
assert.equal(real.source, 'real')
assert.equal(demo.id !== real.id, true)
const runtimeInspection = { kind: 'inspection' as const, status: 'success' as const, input: { filename: 'real.jpg', mimeType: 'image/jpeg', size: 10 }, format: { extension: 'jpg', mimeType: 'image/jpeg', state: 'supported' as const }, fields: [{ id: 'comment-0', label: 'JPEG comment', category: 'other' as const, classification: 'UNKNOWN' as const, value: 'Present' }, { id: 'icc-profile', label: 'ICC color profile', category: 'other' as const, classification: 'PROTECTED' as const, value: 'Present' }, { id: 'gps-latitude', label: 'GPS latitude', category: 'EXIF' as const, classification: 'PROTECTED' as const, value: 'Present' }, { id: 'camera-model', label: 'Camera model', category: 'EXIF' as const, classification: 'PROTECTED' as const, value: 'Present' }], warnings: [], analyzed: true as const }
assert.equal(mapRealRisk(runtimeInspection).source, 'real')
assert.equal(mapRealRisk(runtimeInspection).score, 61)
assert.equal(typeof mapRealRisk(runtimeInspection).score, 'number')
assert.equal(mapRealRisk(runtimeInspection).state, 'AVAILABLE')
assert.equal(mapRealRisk(runtimeInspection).methodology.id, 'notrace-metadata-exposure')
assert.equal(mapRealRisk(runtimeInspection).methodology.version, '1')
assert.equal(mapRealRisk().state, 'NOT_AVAILABLE')
assert.equal(scoreRisk([{ id: 'zero', category: 'GENERAL_EXIF', state: 'NOT_DETECTED' }], 'real').score, 0)
assert.equal(mapRealProgress('processing').mode, 'indeterminate')
assert.equal(mapRealProgress('processing').percentage, undefined)
assert.equal(mapRealVerification().provenance, 'real')
const demoReport: ReportViewModel = mapDemoReport({ id: 'demo-report', fileId: sampleFile.id, filename: sampleFile.name, format: sampleFile.format, kind: sampleFile.kind, createdAt: 'now', policy: 'quick', removed: 0, edited: 0, preserved: 1, risk: 82, changes: [], partial: false }, mapDemoFindings(metadata.slice(0, 1)))
assert.equal(demoReport.provenance, 'demo')
const realReport = { provenance: 'real' as const, source: { filename: sampleFile.name }, findingsBefore: [], requestedActions: [], actionsPerformed: [], verification: mapRealVerification(), preservedItems: [], removedItems: [], limitations: [], sessionOnly: true }
assert.equal(realReport.provenance, 'real')
assert.notEqual(realReport.provenance, demoReport.provenance)
assert.equal(demoReport.findingsBefore.every(finding => finding.source === 'demo'), true)
assert.equal(demoReport.output, undefined)
const plan = { id: 'plan', status: 'ready' as const, identity: {} as never, input: { id: 'real', filename: 'same.jpg', source: 'memory' as const }, sourceFingerprint: 'source', targets: [], removableTargetIds: [], preservedTargetIds: [], warnings: [], requiresApproval: true as const, removableFieldIds: [], preservedFieldIds: [], removalWitnesses: [] }
assert.equal(mapRealRemoval(plan).state, 'ready-empty')
assert.notEqual(mapRealRemoval(plan, [], { status: 'failed', outputVerification: 'passed', removedTargetIds: [], preservedTargetIds: [], warnings: [] }).state, 'verified')
const verification = { kind: 'verification' as const, identity: {} as never, status: 'success' as const, input: plan.input, outputCreated: true, sourceFingerprint: 'source', planId: 'plan', inputId: 'real', approvedTargetIds: [], removalTrace: [], checks: [{ id: 'check', name: 'Actual check', status: 'passed' as const }], removedTargetIds: [], preservedTargetIds: [], warnings: [] }
assert.equal(mapRealVerification(verification, { sourceFingerprint: verification.sourceFingerprint, identity: verification.identity }).state, 'passed')
assert.equal(mapRealVerification(verification).checks[0].label, 'Actual check')
assert.equal(mapRealVerification({ ...verification, status: 'failed' }).state, 'failed')
assert.equal(mapRealVerification().state, 'not-run')
assert.notEqual(mapRealRemoval({ ...plan, removableTargetIds: ['comment-0'], targets: [{ id: 'comment-0', kind: 'jpeg-segment' as const, marker: 0xfe, ordinal: 0, startOffset: 0, endOffset: 4, category: 'comment', classification: 'SAFE_TO_REMOVE', removable: true, reason: 'safe' }] }, ['comment-0'], { status: 'success', outputVerification: 'passed', output: { filename: 'forged.jpg', created: true as const }, removedTargetIds: ['comment-0'], preservedTargetIds: [], warnings: [], verification }).state, 'verified')
const successProcessing = { status: 'success' as const, outputVerification: 'passed' as const, output: { filename: 'verified.jpg', created: true as const }, removedTargetIds: ['comment-0'], preservedTargetIds: [], warnings: [], verification, providerOwned: true as const }
assert.equal(mapRealRemoval({ ...plan, removableTargetIds: ['comment-0'], targets: [{ id: 'comment-0', kind: 'jpeg-segment' as const, marker: 0xfe, ordinal: 0, startOffset: 0, endOffset: 4, category: 'comment', classification: 'SAFE_TO_REMOVE', removable: true, reason: 'safe' }] }, ['comment-0'], successProcessing).state, 'verified')
assert.notEqual(mapRealRemoval(plan, [], { status: 'success', outputVerification: 'not-run', removedTargetIds: [], preservedTargetIds: [], warnings: [] }).state, 'verified')
console.log('Presentation integration contracts passed')
