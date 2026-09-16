import { strict as assert } from 'node:assert'
import { metadata, sampleFile, type DemoReport } from '../notrace-demo'
import { mapDemoFile, mapDemoFindings, mapDemoMetadata, mapDemoProgress, mapDemoReport, mapDemoRisk, mapDemoVerification } from './demo-mapper'
import { mapRealFile, mapRealInspection, mapRealProgress, mapRealRemoval, mapRealReport, mapRealRisk, mapRealVerification } from './real-mapper'
import { deriveReportCounts } from './models'

const demoFile = mapDemoFile(sampleFile)
assert.equal(demoFile.source, 'demo')
assert.equal(mapDemoRisk({ risk: 82, partial: false }).state, 'AVAILABLE')
assert.equal(mapDemoProgress('processing', 42).mode, 'determinate')
assert.equal(mapDemoVerification(false).provenance, 'demo')
assert.equal(mapDemoMetadata(metadata).every(item => item.evidence.source === 'demo-fixture'), true)
assert.equal(mapDemoFindings(metadata).every(item => item.source === 'demo'), true)

const inspection = { kind: 'inspection' as const, status: 'partial' as const, input: { filename: 'same.jpg', mimeType: 'image/jpeg', size: 3 }, format: { extension: 'jpg', mimeType: 'image/jpeg', state: 'supported' as const }, fields: [{ id: 'unknown', label: 'Unknown field', category: 'EXIF' as const, classification: 'UNKNOWN' as const }], warnings: ['incomplete'], analyzed: true as const }
const realFile = mapRealFile({ id: 'real', filename: 'same.jpg', mimeType: 'image/jpeg', size: 3 }, inspection)
assert.equal(realFile.source, 'real')
assert.equal(realFile.operationState, 'inspected')
const realInspection = mapRealInspection(inspection)
assert.equal(realInspection.findings[0].status, 'UNKNOWN')
assert.notEqual(realInspection.findings[0].status, 'NOT_DETECTED')
assert.equal(mapRealRisk().state, 'NOT_AVAILABLE')
assert.equal(mapRealProgress('processing').mode, 'indeterminate')
assert.equal(mapRealProgress('processing').percentage, undefined)
assert.equal(mapRealVerification().provenance, 'real')

const plan = { id: 'plan', status: 'ready' as const, identity: {} as never, input: { id: 'real', filename: 'same.jpg', source: 'memory' as const }, sourceFingerprint: 'x', targets: [], removableTargetIds: [], preservedTargetIds: [], warnings: [], requiresApproval: true as const, removableFieldIds: [], preservedFieldIds: [], removalWitnesses: [] }
const removal = mapRealRemoval(plan)
assert.equal(removal.state, 'ready-empty')
assert.notEqual(removal.state, 'verified')
const report: DemoReport = { id: 'r', fileId: sampleFile.id, filename: sampleFile.name, format: sampleFile.format, kind: sampleFile.kind, createdAt: 'now', policy: 'quick', removed: 0, edited: 0, preserved: 1, risk: 82, changes: [{ label: 'One', before: 'a', after: 'b', action: 'Preserved' }], partial: false }
const demoReport = mapDemoReport(report, mapDemoFindings(metadata.slice(0, 1)))
const realReport = mapRealReport({ filename: 'same.jpg' }, realInspection.findings, removal, mapRealVerification())
assert.equal(demoReport.provenance, 'demo')
assert.equal(realReport.provenance, 'real')
assert.equal(deriveReportCounts(demoReport).found, 1)
assert.equal(deriveReportCounts(realReport).found, 1)
assert.equal(realReport.findingsBefore.some(item => item.source === 'demo'), false)
console.log('Presentation contract tests passed: 20')
