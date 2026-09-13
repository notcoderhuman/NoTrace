import type { LocalInput } from '../domain/input'
import type { InspectionResult, MetadataField } from '../domain/metadata'
import type { BoundaryResult } from '../domain/result'
import { createMemoryArtifact } from '../domain/artifact'
import { validateRemovalApproval, canAuthorizeRemoval } from '../classification/policy'
import type { FormatAdapter } from './registry'
import type { ProcessingResult, RemovalApproval, RemovalPlan, RemovalTarget } from '../domain/operation'
import { phaseOneSafetyPolicy, type SafetyPolicy, structuralLimits } from '../classification/safety-policy'

export const JPEG_MAX_INSPECTION_BYTES = structuralLimits.maxInputBytes
export const JPEG_MAX_SEGMENTS = structuralLimits.maxSegments
export const JPEG_MAX_METADATA_SEGMENT_BYTES = structuralLimits.maxMetadataSegmentBytes
export const JPEG_MAX_TOTAL_METADATA_BYTES = structuralLimits.maxTotalMetadataBytes

const verificationNames = ['output-soi', 'output-eoi', 'segment-structure', 'output-size', 'segment-count', 'approved-com-absent', 'preserved-targets-present', 'image-bytes-preserved', 'retained-segments-preserved', 'retained-order-preserved', 'no-unexpected-changes', 'original-unchanged', 'distinct-artifact'] as const

export type JpegSegmentKind = 'soi' | 'comment' | 'xmp' | 'exif' | 'icc' | 'app' | 'image' | 'eoi'
export type JpegSegmentInventory = Readonly<{
  index: number
  kind: JpegSegmentKind
  marker: number
  startOffset: number
  endOffset: number
  payloadLength: number
  target?: RemovalTarget
}>

export type JpegStructuralInventory = Readonly<{
  segments: readonly JpegSegmentInventory[]
  inputSize: number
}>
const SOI = 0xffd8
const EOI = 0xd9
const APP1 = 0xe1
const APP2 = 0xe2
const COM = 0xfe

function ascii(bytes: Uint8Array, start: number, length: number) {
  return new TextDecoder().decode(bytes.slice(start, start + length))
}

function field(id: string, label: string, category: MetadataField['category'], value: string, classification: MetadataField['classification'] = 'UNKNOWN'): MetadataField {
  return { id, label, category, value, classification }
}

function exifFields(payload: Uint8Array): MetadataField[] {
  const fields: MetadataField[] = [field('exif-present', 'EXIF metadata', 'EXIF', 'Present', 'UNKNOWN')]
  if (payload.length >= 14) {
    const little = payload[6] === 0x49 && payload[7] === 0x49
    const big = payload[6] === 0x4d && payload[7] === 0x4d
    if (little || big) fields.push(field('exif-byte-order', 'EXIF byte order', 'EXIF', little ? 'Little endian' : 'Big endian', 'PROTECTED'))
    else fields.push(field('exif-structure', 'EXIF structure', 'EXIF', 'Unrecognized TIFF byte order', 'UNKNOWN'))
  }
  return fields
}

function segmentCategory(marker: number, payload: Uint8Array): { kind: JpegSegmentKind; category?: RemovalTarget['category']; classification?: RemovalTarget['classification']; removable: boolean; reason?: string } {
  if (marker === COM) return { kind: 'comment', category: 'comment', classification: 'SAFE_TO_REMOVE', removable: true, reason: 'Recognized JPEG COM segment; removal still requires an approved policy and future verified executor.' }
  if (marker === APP1 && ascii(payload, 0, 6) === 'Exif\0\0') return { kind: 'exif', category: 'exif', classification: 'UNKNOWN', removable: false, reason: 'Individual EXIF fields are not safely parsed.' }
  if (marker === APP1 && ascii(payload, 0, 29).startsWith('http://ns.adobe.com/xap/1.0/')) return { kind: 'xmp', category: 'xmp', classification: 'UNKNOWN', removable: false, reason: 'XMP removal is not enabled during structural inventory.' }
  if (marker === APP2 && ascii(payload, 0, 12) === 'ICC_PROFILE\0') return { kind: 'icc', category: 'icc', classification: 'PROTECTED', removable: false, reason: 'ICC profiles are protected.' }
  if (marker >= 0xe0 && marker <= 0xef) return { kind: 'app', category: 'unknown', classification: 'UNSUPPORTED', removable: false, reason: 'Unknown APP segments are preserved.' }
  if ((marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) || marker === 0xda) return { kind: 'image', removable: false, reason: 'Image-coded JPEG structure is preserved.' }
  return { kind: 'app', removable: false, reason: 'Unrecognized JPEG structure is preserved.' }
}

function inspectSegments(bytes: Uint8Array): BoundaryResult<{ fields: readonly MetadataField[]; inventory: JpegStructuralInventory }> {
  if (bytes.length < 2 || (bytes[0] << 8 | bytes[1]) !== SOI) return { ok: false, error: { code: 'UNSUPPORTED', message: 'Input is not a JPEG stream.' } }
  const fields: MetadataField[] = []
  const segments: JpegSegmentInventory[] = [{ index: 0, kind: 'soi', marker: SOI, startOffset: 0, endOffset: 2, payloadLength: 0 }]
  let offset = 2
  let sawEoi = false
  let metadataBytes = 0
  const counts = new Map<string, number>()
  while (offset < bytes.length) {
    if (segments.length >= JPEG_MAX_SEGMENTS) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG segment count exceeds the structural limit.' } }
    const startOffset = offset
    if (bytes[offset] !== 0xff) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Malformed JPEG marker prefix.' } }
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    if (offset >= bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Truncated JPEG marker.' } }
    const marker = bytes[offset++]
    if (marker === 0x00) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Invalid JPEG marker.' } }
    if (marker === EOI) { sawEoi = true; segments.push({ index: segments.length, kind: 'eoi', marker, startOffset, endOffset: offset, payloadLength: 0 }); break }
    if (marker >= 0xd0 && marker <= 0xd9) { segments.push({ index: segments.length, kind: 'image', marker, startOffset, endOffset: offset, payloadLength: 0 }); continue }
    if (offset + 2 > bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Truncated JPEG segment length.' } }
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'JPEG segment exceeds input bounds.' } }
    const payloadStart = offset + 2
    const payloadLength = length - 2
    if (payloadLength > JPEG_MAX_METADATA_SEGMENT_BYTES && marker >= 0xe0 && marker <= 0xef) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG metadata segment exceeds the structural limit.' } }
    const payload = bytes.subarray(payloadStart, offset + length)
    const classified = segmentCategory(marker, payload)
    const ordinalKey = classified.category ?? classified.kind
    const ordinal = counts.get(ordinalKey) ?? 0
    counts.set(ordinalKey, ordinal + 1)
    const target = classified.category && classified.classification ? { id: `jpeg-${classified.category === 'unknown' ? `app-${marker.toString(16)}` : classified.category}-${ordinal}`, kind: 'jpeg-segment' as const, marker, category: classified.category, classification: classified.classification, removable: classified.removable, reason: classified.reason ?? 'Preserved by structural policy.' } : undefined
    segments.push({ index: segments.length, kind: classified.kind, marker, startOffset, endOffset: offset + length, payloadLength, target })
    if (marker >= 0xe0 && marker <= 0xef) metadataBytes += payloadLength
    if (metadataBytes > JPEG_MAX_TOTAL_METADATA_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG metadata exceeds the structural limit.' } }
    if (marker === APP1 && ascii(payload, 0, 6) === 'Exif\0\0') fields.push(...exifFields(payload))
    else if (marker === APP1 && ascii(payload, 0, 29).startsWith('http://ns.adobe.com/xap/1.0/')) fields.push(field('xmp-present', 'XMP metadata', 'XMP', 'Present', 'UNKNOWN'))
    else if (marker === APP2 && ascii(payload, 0, 12) === 'ICC_PROFILE\0') fields.push(field('icc-profile', 'ICC color profile', 'other', 'Present', 'PROTECTED'))
    else if (marker === COM) fields.push(field(`comment-${fields.length}`, 'JPEG comment', 'other', `Present (${payload.length} bytes)`, 'UNKNOWN'))
    offset += length
  }
  if (!sawEoi) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'JPEG stream has no EOI marker.' } }
  return { ok: true, value: { fields, inventory: { segments, inputSize: bytes.byteLength } } }
}

export async function inspectJpeg(input: LocalInput): Promise<BoundaryResult<InspectionResult>> {
  const descriptor = input.descriptor
  if (descriptor.size !== undefined && descriptor.size > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the inspection size limit.' } }
  const bytes = await input.read(undefined)
  if (!bytes.ok) return bytes
  if (bytes.value.byteLength > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the inspection size limit.' } }
  const parsed = inspectSegments(bytes.value)
  if (!parsed.ok) return parsed
  return { ok: true, value: { kind: 'inspection', status: 'success', input: { filename: descriptor.filename, mimeType: descriptor.mimeType, size: descriptor.size ?? bytes.value.byteLength }, format: { extension: descriptor.filename.split('.').pop()?.toLowerCase(), mimeType: 'image/jpeg', state: 'supported' }, fields: parsed.value.fields, warnings: parsed.value.fields.length ? [] : ['No supported metadata segments were found.'], analyzed: true } }
}

export function createJpegRemovalPlan(input: LocalInput, inventory: JpegStructuralInventory, requestedTargetIds: readonly string[], policy: SafetyPolicy = phaseOneSafetyPolicy): BoundaryResult<RemovalPlan> {
  const requested = new Set(requestedTargetIds)
  const targets = inventory.segments.flatMap(segment => segment.target ? [segment.target] : [])
  const removableTargetIds = targets.filter(target => canAuthorizeRemoval(target, policy) && requested.has(target.id)).map(target => target.id)
  const preservedTargetIds = targets.filter(target => !removableTargetIds.includes(target.id)).map(target => target.id)
  const unknownRequests = requestedTargetIds.filter(id => !targets.some(target => target.id === id))
  const warnings = targets.filter(target => !target.removable).map(target => `${target.id}: ${target.reason}`)
  if (unknownRequests.length) warnings.push(...unknownRequests.map(id => `${id}: target was not found in the structural inventory.`))
  return { ok: true, value: { id: `plan-${input.descriptor.id}-${inventory.inputSize}`, status: removableTargetIds.length ? 'ready' : 'unsupported', input: input.descriptor, targets, removableTargetIds, preservedTargetIds, warnings, requiresApproval: true, removableFieldIds: [], preservedFieldIds: [] } }
}

export async function planJpegRemoval(input: LocalInput, requestedTargetIds: readonly string[], _policyName: string, signal?: AbortSignal): Promise<BoundaryResult<RemovalPlan>> {
  const inventory = await inspectJpegStructure(input, signal)
  if (!inventory.ok) return inventory
  return createJpegRemovalPlan(input, inventory.value, requestedTargetIds, phaseOneSafetyPolicy)
}

function verificationChecks(status: 'passed' | 'failed' | 'not-run') {
  return verificationNames.map(id => ({ id, name: id, status }))
}

export async function verifyJpegOutput(input: LocalInput, output: import('../domain/artifact').OutputArtifact, plan: RemovalPlan, approval: RemovalApproval, signal?: AbortSignal): Promise<BoundaryResult<import('../domain/result').VerificationResult>> {
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Verification was cancelled.' } }
  const original = await input.read(undefined, signal)
  if (!original.ok) return original
  const originalAgain = await input.read(undefined, signal)
  if (!originalAgain.ok) return originalAgain
  const generated = await output.read(undefined, signal)
  if (!generated.ok) return generated
  const failed = (message: string, id: string): BoundaryResult<import('../domain/result').VerificationResult> => ({ ok: false, error: { code: 'VERIFICATION_FAILED', message: `${message} [${id}]` } })
  if (output.id === input.descriptor.id) return failed('Output artifact identity is not distinct.', 'distinct-artifact')
  if (original.value.length !== originalAgain.value.length || original.value.some((value, index) => value !== originalAgain.value[index])) return failed('Original input changed during verification.', 'original-unchanged')
  if (generated.value.length > structuralLimits.maxOutputBytes) return failed('Output exceeds the configured size limit.', 'output-size')
  const source = inspectSegments(original.value)
  const observed = inspectSegments(generated.value)
  if (!source.ok || !observed.ok) return failed('JPEG structure could not be independently verified.', 'segment-structure')
  const approved = new Set(approval.approvedTargetIds)
  const sourceSegments = source.value.inventory.segments
  const outputSegments = observed.value.inventory.segments
  const approvedSegments = sourceSegments.filter(segment => segment.target && approved.has(segment.target.id))
  if (approvedSegments.length !== approved.size) return failed('Approved COM targets are not present in the original inventory.', 'approved-com-absent')
  if (approvedSegments.some(segment => segment.kind !== 'comment' || segment.target?.category !== 'comment')) return failed('Only COM targets may be verified for removal.', 'approved-com-absent')
  const retainedSource = sourceSegments.filter(segment => !segment.target || !approved.has(segment.target.id))
  if (outputSegments.length !== retainedSource.length) return failed('Unexpected JPEG segment insertion or deletion detected.', 'no-unexpected-changes')
  for (let index = 0; index < retainedSource.length; index++) {
    const expected = original.value.slice(retainedSource[index].startOffset, retainedSource[index].endOffset)
    const actual = generated.value.slice(outputSegments[index].startOffset, outputSegments[index].endOffset)
    if (expected.length !== actual.length || expected.some((value, byte) => value !== actual[byte])) return failed('A retained JPEG segment changed or moved.', 'retained-segments-preserved')
  }
  const preservedTargetIds = sourceSegments.flatMap(segment => segment.target && !approved.has(segment.target.id) ? [segment.target.id] : [])
  return { ok: true, value: { kind: 'verification', status: 'success', input: input.descriptor, outputCreated: true, output, checks: verificationChecks('passed'), removedTargetIds: approvedSegments.map(segment => segment.target!.id), preservedTargetIds, warnings: [] } }
}

export async function removeJpegCom(input: LocalInput, plan: RemovalPlan, approval: RemovalApproval, signal?: AbortSignal): Promise<BoundaryResult<ProcessingResult>> {
  const invalid = { ok: false as const, error: { code: 'INVALID_INPUT' as const, message: 'Removal approval is invalid.' } }
  if (!validateRemovalApproval(approval, plan) || approval.inputId !== input.descriptor.id || new Set(approval.approvedTargetIds).size !== approval.approvedTargetIds.length) return invalid
  const approved = new Set(approval.approvedTargetIds)
  const targets = plan.targets.filter(target => approved.has(target.id))
  if (!targets.length || targets.some(target => target.kind !== 'jpeg-segment' || target.category !== 'comment' || !canAuthorizeRemoval(target, phaseOneSafetyPolicy))) return invalid
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } }
  const bytes = await input.read(undefined, signal)
  if (!bytes.ok) return bytes
  if (bytes.value.byteLength > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the processing size limit.' } }
  const parsed = inspectSegments(bytes.value)
  if (!parsed.ok) return parsed
  const currentIds = new Set(parsed.value.inventory.segments.flatMap(segment => segment.target ? [segment.target.id] : []))
  if (targets.some(target => !currentIds.has(target.id))) return invalid
  const ranges = new Set(targets.map(target => parsed.value.inventory.segments.find(segment => segment.target?.id === target.id)?.startOffset))
  const outputParts: Uint8Array[] = []
  let size = 0
  for (const segment of parsed.value.inventory.segments) {
    if (ranges.has(segment.startOffset)) continue
    if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } }
    const part = bytes.value.slice(segment.startOffset, segment.endOffset)
    size += part.byteLength
    if (size > structuralLimits.maxOutputBytes) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG output exceeds the processing size limit.' } }
    outputParts.push(part)
  }
  const output = new Uint8Array(size)
  let offset = 0
  for (const part of outputParts) { output.set(part, offset); offset += part.byteLength }
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } }
  const artifact = createMemoryArtifact(output, input.descriptor.filename.replace(/\.(?:jpe?g)$/i, '') + '_notrace.jpg')
  return { ok: true, value: { kind: 'processing', status: 'success', input: { filename: input.descriptor.filename, mimeType: input.descriptor.mimeType, size: input.descriptor.size }, output: { filename: artifact.filename, created: true, artifact }, outputVerification: 'not-run', removedTargetIds: targets.map(target => target.id), preservedTargetIds: plan.targets.filter(target => !approved.has(target.id)).map(target => target.id), warnings: ['Output created in memory. Independent verification has not been performed.'] } }
}

export async function inspectJpegStructure(input: LocalInput, signal?: AbortSignal): Promise<BoundaryResult<JpegStructuralInventory>> {
  const descriptor = input.descriptor
  if (descriptor.size !== undefined && descriptor.size > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the inspection size limit.' } }
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Inspection was cancelled.' } }
  const bytes = await input.read(undefined, signal)
  if (!bytes.ok) return bytes
  if (bytes.value.byteLength > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the inspection size limit.' } }
  const parsed = inspectSegments(bytes.value)
  return parsed.ok ? { ok: true, value: parsed.value.inventory } : parsed
}

export const jpegAdapter: FormatAdapter & { inspect: typeof inspectJpeg } = {
  id: 'jpeg-inspection',
  capability: { extensions: ['jpg', 'jpeg'], mimeTypes: ['image/jpeg'], operations: ['inspect', 'remove'] },
  inspect: inspectJpeg,
  planRemoval: planJpegRemoval,
  remove: removeJpegCom,
  verifyOutput: verifyJpegOutput,
}
