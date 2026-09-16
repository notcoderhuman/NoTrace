import type { LocalInput } from '../domain/input'
import type { OutputArtifact } from '../domain/artifact'
import type { RemovalApproval, RemovalPlan } from '../domain/operation'
import { JPEG_VERIFICATION_CHECK_IDS, type BoundaryResult, type VerificationResult } from '../domain/result'
import { scanJpegForVerification, type IndependentJpegRecord } from './jpeg-verifier-scanner'

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

type OccurrenceMapping = Readonly<{ sourceIndex: number; outputIndex: number }>

/**
 * Enumerate structural subsequence mappings rather than assuming output ordinal
 * preserves source identity. Two mappings are enough to establish ambiguity;
 * callers must fail closed when the cap is reached.
 */
function occurrenceMappings(source: readonly IndependentJpegRecord[], output: readonly IndependentJpegRecord[], sourceBytes: Uint8Array, outputBytes: Uint8Array): readonly (readonly OccurrenceMapping[])[] {
  const mappings: OccurrenceMapping[][] = []
  const walk = (sourceIndex: number, outputIndex: number, current: OccurrenceMapping[]) => {
    if (mappings.length > 1) return
    if (outputIndex === output.length) { mappings.push(current); return }
    for (let index = sourceIndex; index < source.length; index++) {
      const sourceRecord = source[index]
      const outputRecord = output[outputIndex]
      if (sourceRecord.kind !== outputRecord.kind || sourceRecord.marker !== outputRecord.marker) continue
      if (!equalBytes(sourceBytes.slice(sourceRecord.start, sourceRecord.end), outputBytes.slice(outputRecord.start, outputRecord.end))) continue
      walk(index + 1, outputIndex + 1, [...current, { sourceIndex: index, outputIndex }])
      if (mappings.length > 1) return
    }
  }
  walk(0, 0, [])
  return mappings
}

export async function verifyJpegOutputIndependently(input: LocalInput, output: OutputArtifact, plan: RemovalPlan, approval: RemovalApproval, signal?: AbortSignal): Promise<BoundaryResult<VerificationResult>> {
  const fail = (message: string, id: string): BoundaryResult<VerificationResult> => ({ ok: false, error: { code: 'VERIFICATION_FAILED', message: `${message} [${id}]` } })
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Verification was cancelled.' } }
  const original = await input.read(undefined, signal)
  if (!original.ok) return original
  const originalAgain = await input.read(undefined, signal)
  if (!originalAgain.ok) return originalAgain
  if (!equalBytes(original.value, originalAgain.value)) return fail('Original input changed during verification.', 'original-unchanged')
  const generated = await output.read(undefined, signal)
  if (!generated.ok) return generated
  if (output.mediaType !== 'image/jpeg' || !Number.isSafeInteger(output.size) || output.size !== generated.value.byteLength || output.size > 32 * 1024 * 1024) return fail('Output artifact metadata does not match its bytes.', 'output-size-metadata')
  const generatedAgain = await output.read(undefined, signal)
  if (!generatedAgain.ok || !equalBytes(generated.value, generatedAgain.value)) return fail('Output artifact changed during verification.', 'output-unchanged')
  if (output.id === input.descriptor.id) return fail('Output artifact identity is not distinct.', 'distinct-artifact')
  const sourceFingerprint = await sha256(original.value)
  if (approval.planId !== plan.id || approval.inputId !== plan.input.id || approval.sourceFingerprint !== plan.sourceFingerprint || approval.sourceFingerprint !== sourceFingerprint || (approval.identity && (!plan.identity || JSON.stringify(approval.identity) !== JSON.stringify(plan.identity)))) return fail('Verification approval does not match the planned source.', 'approval-binding')
  const source = scanJpegForVerification(original.value, signal)
  if (!source.ok) return source
  const observed = scanJpegForVerification(generated.value, signal)
  if (!observed.ok) return observed
  const approvedIds = new Set(approval.approvedTargetIds)
  if (approvedIds.size !== approval.approvedTargetIds.length) return fail('Verification approval contains duplicate targets.', 'approval-binding')
  const witnesses = plan.removalWitnesses.filter(witness => approvedIds.has(witness.targetId))
  if (witnesses.length !== approvedIds.size || approval.approvedTargetIds.some(id => !plan.removableTargetIds.includes(id))) return fail('Verification approval contains an unauthorized target.', 'approval-binding')
  for (const witness of witnesses) {
    const matching = source.value.comRecords.find(record => record.start === witness.startOffset && record.end === witness.endOffset && record.ordinal === witness.ordinal)
    if (!matching || witness.marker !== 0xfe || witness.rangeLength !== witness.endOffset - witness.startOffset || witness.sourceFingerprint !== sourceFingerprint) return fail('Removal witness does not match the source.', 'target-witness')
  }
  const approvedRanges = new Set(witnesses.map(witness => `${witness.startOffset}:${witness.endOffset}`))
  const retainedSource = source.value.records.filter(record => !approvedRanges.has(`${record.start}:${record.end}`))
  const outputRecords = observed.value.records
  const mappings = occurrenceMappings(source.value.records, outputRecords, original.value, generated.value)
  if (mappings.length !== 1) return fail('JPEG structural occurrence reconciliation was ambiguous or missing.', 'approved-com-absent')
  const mapping = mappings[0]
  if (mapping.length !== outputRecords.length) return fail('Unexpected JPEG segment insertion or deletion detected.', 'no-unexpected-changes')
  const approvedSourceIndexes = new Set(witnesses.map(witness => source.value.records.findIndex(record => record.start === witness.startOffset && record.end === witness.endOffset && record.ordinal === witness.ordinal)))
  const mappedSourceIndexes = new Set(mapping.map(entry => entry.sourceIndex))
  if ([...approvedSourceIndexes].some(index => mappedSourceIndexes.has(index))) return fail('An approved JPEG occurrence remains in the output.', 'approved-com-absent')
  if (mapping.length !== retainedSource.length || mappedSourceIndexes.size !== retainedSource.length) return fail('Approved JPEG target absence could not be proven.', 'approved-com-absent')
  for (const entry of mapping) {
    const sourceRecord = source.value.records[entry.sourceIndex]
    const outputRecord = outputRecords[entry.outputIndex]
    if (sourceRecord.kind !== outputRecord.kind || sourceRecord.marker !== outputRecord.marker || !equalBytes(original.value.slice(sourceRecord.start, sourceRecord.end), generated.value.slice(outputRecord.start, outputRecord.end))) return fail('A retained JPEG range changed or moved.', 'retained-segments-preserved')
  }
  const preservedTargetIds = plan.targets.filter(target => !approvedIds.has(target.id)).map(target => target.id)
  const checks = JPEG_VERIFICATION_CHECK_IDS.map(id => ({ id, name: id, status: 'passed' as const }))
  return { ok: true, value: { kind: 'verification', status: 'success', input: input.descriptor, outputCreated: true, output, sourceFingerprint, identity: plan.identity, planId: plan.id, inputId: plan.input.id, approvedTargetIds: approval.approvedTargetIds, removalTrace: witnesses.map(witness => ({ ...witness })), checks, removedTargetIds: approval.approvedTargetIds, preservedTargetIds, warnings: [] } }
}

export const jpegVerifierAdapter = {
  id: 'jpeg-verifier',
  role: 'verifier' as const,
  formatId: 'jpeg', engineId: 'notrace-jpeg', engineVersion: '1', capabilityKey: 'jpeg:verify', verifierCompatibilityKey: 'notrace-jpeg-com-v1', verifierIndependence: 'structural-independent' as const, verificationCheckIds: JPEG_VERIFICATION_CHECK_IDS,
  probe: async (input: LocalInput, signal?: AbortSignal) => { const prefix = await input.read({ offset: 0, length: Math.min(2, input.descriptor.size ?? 2) }, signal); if (!prefix.ok) return prefix; return prefix.value.length === 2 && prefix.value[0] === 0xff && prefix.value[1] === 0xd8 ? { ok: true as const, value: { formatId: 'jpeg', mediaType: 'image/jpeg', confidence: 'structural' as const } } : { ok: false as const, error: { code: 'UNSUPPORTED' as const, message: 'Input is not a JPEG stream.' } } },
  capability: { extensions: ['jpg', 'jpeg'], mimeTypes: ['image/jpeg'], operations: ['verify'] as const },
  verifyOutput: verifyJpegOutputIndependently,
}
