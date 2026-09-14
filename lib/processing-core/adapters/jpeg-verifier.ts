import type { LocalInput } from '../domain/input'
import type { OutputArtifact } from '../domain/artifact'
import type { RemovalApproval, RemovalPlan } from '../domain/operation'
import { JPEG_VERIFICATION_CHECK_IDS, type BoundaryResult, type VerificationResult } from '../domain/result'
import { createMemoryInput } from '../domain/input'
import { inspectJpegStructure } from './jpeg'

export async function verifyJpegOutputIndependently(input: LocalInput, output: OutputArtifact, plan: RemovalPlan, approval: RemovalApproval, signal?: AbortSignal): Promise<BoundaryResult<VerificationResult>> {
  const fail = (message: string, id: string): BoundaryResult<VerificationResult> => ({ ok: false, error: { code: 'VERIFICATION_FAILED', message: `${message} [${id}]` } })
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Verification was cancelled.' } }
  const original = await input.read(undefined, signal)
  if (!original.ok) return original
  const originalAgain = await input.read(undefined, signal)
  if (!originalAgain.ok) return originalAgain
  if (original.value.length !== originalAgain.value.length || original.value.some((value, index) => value !== originalAgain.value[index])) return fail('Original input changed during verification.', 'original-unchanged')
  const generated = await output.read(undefined, signal)
  if (!generated.ok) return generated
  if (output.id === input.descriptor.id) return fail('Output artifact identity is not distinct.', 'distinct-artifact')
  const source = await inspectJpegStructure(input, signal)
  if (!source.ok) return fail('Source JPEG structure could not be verified.', 'segment-structure')
  const generatedInput = createMemoryInput(generated.value, { id: output.id, filename: output.filename, mimeType: output.mediaType, size: generated.value.byteLength })
  const observed = await inspectJpegStructure(generatedInput, signal)
  if (!observed.ok) return fail('Output JPEG structure could not be verified.', 'segment-structure')
  if (approval.planId !== plan.id || approval.inputId !== plan.input.id || approval.sourceFingerprint !== plan.sourceFingerprint || approval.sourceFingerprint !== source.value.sourceFingerprint) return fail('Verification approval does not match the planned source.', 'approval-binding')
  if (plan.targets.some(target => target.kind !== 'jpeg-segment' || target.startOffset < 0 || target.endOffset <= target.startOffset || target.endOffset - target.startOffset < 4)) return fail('Verification plan contains invalid target identity.', 'target-identity')
  if (new Set(approval.approvedTargetIds).size !== approval.approvedTargetIds.length) return fail('Verification approval contains duplicate targets.', 'approval-binding')
  const witnesses = plan.removalWitnesses.filter(witness => approval.approvedTargetIds.includes(witness.targetId))
  const trace = witnesses.map(witness => ({ ...witness }))
  if (witnesses.length !== approval.approvedTargetIds.length || witnesses.some(witness => {
    const target = source.value.segments.find(segment => segment.target?.id === witness.targetId)?.target
    return !target || target.ordinal !== witness.ordinal || target.startOffset !== witness.startOffset || target.endOffset !== witness.endOffset || target.marker !== witness.marker || witness.sourceFingerprint !== source.value.sourceFingerprint || witness.rangeLength !== witness.endOffset - witness.startOffset || witness.startOffset < 0 || witness.endOffset > original.value.length
  })) return fail('Verification removal witness does not match the source.', 'target-witness')
  const allowed = new Set(plan.removableTargetIds)
  if (approval.approvedTargetIds.some(id => !allowed.has(id))) return fail('Verification approval contains an unauthorized target.', 'approval-binding')
  const approved = new Set(approval.approvedTargetIds)
  const sourceSegments = source.value.segments
  const outputSegments = observed.value.segments
  const approvedSegments = sourceSegments.filter(segment => segment.target && approved.has(segment.target.id))
  if (approvedSegments.length !== approved.size) return fail('Approved targets are not present in the source inventory.', 'approved-com-absent')
  if (approvedSegments.some(segment => segment.kind !== 'comment' || segment.target?.category !== 'comment')) return fail('Only COM targets may be verified for removal.', 'approved-com-absent')
  const retained = sourceSegments.filter(segment => !segment.target || !approved.has(segment.target.id))
  if (retained.length !== outputSegments.length) return fail('Unexpected JPEG segment insertion or deletion detected.', 'no-unexpected-changes')
  for (let index = 0; index < retained.length; index++) {
    const expected = original.value.slice(retained[index].startOffset, retained[index].endOffset)
    const actual = generated.value.slice(outputSegments[index].startOffset, outputSegments[index].endOffset)
    if (expected.length !== actual.length || expected.some((value, byte) => value !== actual[byte])) return fail('A retained JPEG range changed or moved.', 'retained-segments-preserved')
  }
  const preservedTargetIds = sourceSegments.flatMap(segment => segment.target && !approved.has(segment.target.id) ? [segment.target.id] : [])
  const removalTrace = trace
  const checks = JPEG_VERIFICATION_CHECK_IDS.map(id => ({ id, name: id, status: 'passed' as const }))
  return { ok: true, value: { kind: 'verification', status: 'success', input: input.descriptor, outputCreated: true, output, sourceFingerprint: source.value.sourceFingerprint, planId: plan.id, inputId: plan.input.id, approvedTargetIds: approval.approvedTargetIds, removalTrace, checks, removedTargetIds: approvedSegments.map(segment => segment.target!.id), preservedTargetIds, warnings: [] } }
}

export const jpegVerifierAdapter = {
  id: 'jpeg-verifier',
  role: 'verifier' as const,
  capability: { extensions: ['jpg', 'jpeg'], mimeTypes: ['image/jpeg'], operations: ['verify'] as const },
  verifyOutput: verifyJpegOutputIndependently,
}
