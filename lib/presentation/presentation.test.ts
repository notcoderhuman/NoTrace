import { strict as assert } from 'node:assert'
import { metadata, sampleFile, type DemoReport } from '../notrace-demo'
import { mapDemoFile, mapDemoFindings, mapDemoMetadata, mapDemoProgress, mapDemoReport, mapDemoRisk, mapDemoVerification } from './demo-mapper'
import { mapRealFile, mapRealInspection, mapRealProgress, mapRealRemoval, mapRealReport, mapRealRisk, mapRealVerification } from './real-mapper'
import { deriveReportCounts } from './models'
import { classifyRisk, scoreRisk } from './risk-scoring'

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
assert.equal(scoreRisk([{ id: 'exif', category: 'GENERAL_EXIF', state: 'PRESENT' }], 'real').source, 'real')
assert.equal(scoreRisk([{ id: 'icc', category: 'ICC', state: 'PRESENT' }, { id: 'com', category: 'JPEG_COM', state: 'PRESENT' }], 'real').score, 6)
assert.equal(scoreRisk([{ id: 'gps', category: 'LOCATION', state: 'PRESENT' }], 'real').score, 35)
assert.equal(scoreRisk([{ id: 'device', category: 'DEVICE', state: 'PRESENT' }], 'real').score, 20)
assert.equal(scoreRisk([{ id: 'creator', category: 'CREATOR', state: 'PRESENT' }], 'real').score, 15)
assert.equal(scoreRisk([{ id: 'time', category: 'TIMESTAMP', state: 'PRESENT' }], 'real').score, 10)
assert.equal(scoreRisk([{ id: 'software', category: 'SOFTWARE', state: 'PRESENT' }], 'real').score, 5)
assert.equal(scoreRisk([{ id: 'iptc', category: 'IPTC', state: 'PRESENT' }, { id: 'xmp', category: 'XMP', state: 'PRESENT' }], 'real').score, 15)
assert.equal(scoreRisk([{ id: 'gps', category: 'LOCATION', state: 'UNKNOWN' }], 'real').state, 'PARTIAL')
assert.equal(scoreRisk([{ id: 'x', category: 'XMP', state: 'UNSUPPORTED' }], 'real').score, 0)
assert.equal(scoreRisk([{ id: 'x', category: 'XMP', state: 'NOT_DETECTED' }], 'real').score, 0)
assert.equal(mapRealRisk({ ...inspection, status: 'success', fields: [{ id: 'x', label: 'Unsupported field', category: 'EXIF', classification: 'UNSUPPORTED' }] }).state, 'PARTIAL')
assert.equal(scoreRisk([{ id: 'x', category: 'GENERAL_EXIF', state: 'PRESENT' }, { id: 'y', category: 'GENERAL_EXIF', state: 'PRESENT' }], 'real').score, 4)
assert.equal(scoreRisk([{ id: 'a', category: 'GENERAL_EXIF', state: 'PRESENT' }, { id: 'b', category: 'XMP', state: 'PRESENT' }], 'real').level, 'Low')
assert.deepEqual(scoreRisk([{ id: 'a', category: 'GENERAL_EXIF', state: 'PRESENT' }, { id: 'b', category: 'XMP', state: 'PRESENT' }], 'real'), scoreRisk([{ id: 'b', category: 'XMP', state: 'PRESENT' }, { id: 'a', category: 'GENERAL_EXIF', state: 'PRESENT' }], 'real'))
for (const [score, level] of [[0, 'Low'], [1, 'Low'], [39, 'Low'], [40, 'Medium'], [41, 'Medium'], [69, 'Medium'], [70, 'High'], [71, 'High'], [100, 'High']] as const) assert.equal(classifyRisk(score), level)
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
console.log('Presentation contract checks passed')
