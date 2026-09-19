import type { LocalInput } from '../domain/input'
import type { InspectionResult, MetadataField } from '../domain/metadata'
import type { EvidenceRecord, StaticCapabilityDeclaration, ResourceContract, AdapterConformance } from '../domain/contracts'
import { JPEG_VERIFICATION_CHECK_IDS, type BoundaryResult } from '../domain/result'
import { createMemoryArtifact } from '../domain/artifact'
import { validateRemovalApproval, canAuthorizeRemoval } from '../classification/policy'
import type { FormatAdapter } from './registry'
import type { ProcessingResult, RemovalApproval, RemovalPlan, RemovalTarget, RemovalTraceEntry } from '../domain/operation'
import { phaseOneSafetyPolicy, type SafetyPolicy, structuralLimits } from '../classification/safety-policy'
import { JPEG_PROCESSING_IDENTITY } from '../domain/identity'
import { probePrefix } from '../domain/probe'
import type { AdapterContract, ContractOperationContext } from '../domain/contracts'
import { verifyJpegOutputIndependently } from './jpeg-verifier'

export const JPEG_MAX_INSPECTION_BYTES = structuralLimits.maxInputBytes
export const JPEG_MAX_SEGMENTS = structuralLimits.maxSegments
export const JPEG_MAX_METADATA_SEGMENT_BYTES = structuralLimits.maxMetadataSegmentBytes
export const JPEG_MAX_TOTAL_METADATA_BYTES = structuralLimits.maxTotalMetadataBytes

export const jpegCapabilityDeclaration: StaticCapabilityDeclaration = {
  formatId: 'jpeg',
  operations: ['inspect', 'planRemoval', 'executeRemoval', 'verifyRemoval'],
  extensions: ['jpg', 'jpeg'],
  mimeTypes: ['image/jpeg'],
  processingIdentity: JPEG_PROCESSING_IDENTITY,
  verifierCompatibilityKey: 'notrace-jpeg-com-v1',
  /** Canonical expected verification checks; the sole source of truth for the JPEG check set. */
  verificationCheckIds: JPEG_VERIFICATION_CHECK_IDS,
}

export const jpegResourceContract: ResourceContract = {
  inputBound: { maxBytes: JPEG_MAX_INSPECTION_BYTES, state: 'measured' },
  fullBufferOperations: { state: 'inferred' },
  streaming: { supported: false, state: 'measured' },
  worker: { required: false, state: 'measured' },
  transfer: { transferable: false, copies: true, state: 'inferred' },
  temporaryAllocations: 'inferred',
  concurrency: { state: 'unmeasured' },
  cancellationPoints: ['input read', 'structural scan', 'fingerprint', 'segment copy', 'verification'],
}

export const jpegConformance: AdapterConformance = {
  level: 'verification-capable',
  declaration: jpegCapabilityDeclaration,
  resource: jpegResourceContract,
  independentVerifier: true,
}

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
  sourceFingerprint: string
}>
const SOI = 0xffd8
const EOI = 0xd9
const APP1 = 0xe1
const APP2 = 0xe2
const COM = 0xfe

async function fingerprint(bytes: Uint8Array, signal?: AbortSignal): Promise<BoundaryResult<string>> {
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'JPEG fingerprinting was cancelled.' } }
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'JPEG fingerprinting was cancelled.' } }
  return { ok: true, value: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') }
}

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

function findScanMarker(bytes: Uint8Array, start: number, signal?: AbortSignal): BoundaryResult<{ markerOffset: number; marker: number }> {
  let offset = start
  while (offset < bytes.length) {
    if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'JPEG parsing was cancelled.' } }
    if (bytes[offset] !== 0xff) { offset++; continue }
    const markerOffset = offset
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    if (offset >= bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Truncated JPEG scan data.' } }
    const marker = bytes[offset]
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) { offset++; continue }
    return { ok: true, value: { markerOffset, marker } }
  }
  return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'JPEG scan data has no terminating marker.' } }
}

function inspectSegments(bytes: Uint8Array, signal?: AbortSignal): BoundaryResult<{ fields: readonly MetadataField[]; inventory: JpegStructuralInventory }> {
  if (bytes.length < 2 || (bytes[0] << 8 | bytes[1]) !== SOI) return { ok: false, error: { code: 'UNSUPPORTED', message: 'Input is not a JPEG stream.' } }
  const fields: MetadataField[] = []
  const segments: JpegSegmentInventory[] = [{ index: 0, kind: 'soi', marker: SOI, startOffset: 0, endOffset: 2, payloadLength: 0 }]
  let offset = 2
  let sawEoi = false
  let sawFrame = false
  let sawScan = false
  let progressive = false
  let frameComponents = new Map<number, { dc: boolean; ac: boolean }>()
  let metadataBytes = 0
  const counts = new Map<string, number>()
  while (offset < bytes.length) {
    if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'JPEG parsing was cancelled.' } }
    if (segments.length >= JPEG_MAX_SEGMENTS) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG segment count exceeds the structural limit.' } }
    const startOffset = offset
    if (bytes[offset] !== 0xff) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Malformed JPEG marker prefix.' } }
    while (offset < bytes.length && bytes[offset] === 0xff) offset++
    if (offset >= bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Truncated JPEG marker.' } }
    const marker = bytes[offset++]
    if (marker === 0x00 || marker === 0x01 || (marker >= 0x02 && marker <= 0xbf) || marker === 0xd8) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Illegal JPEG marker.' } }
    if (marker === EOI) { sawEoi = true; segments.push({ index: segments.length, kind: 'eoi', marker, startOffset, endOffset: offset, payloadLength: 0 }); break }
    if (marker >= 0xd0 && marker <= 0xd7) { segments.push({ index: segments.length, kind: 'image', marker, startOffset, endOffset: offset, payloadLength: 0 }); continue }
    if (marker === 0xd9) { sawEoi = true; segments.push({ index: segments.length, kind: 'eoi', marker, startOffset, endOffset: offset, payloadLength: 0 }); break }
    if (offset + 2 > bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Truncated JPEG segment length.' } }
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'JPEG segment exceeds input bounds.' } }
    const payloadStart = offset + 2
    const payloadLength = length - 2
    if (payloadLength > JPEG_MAX_METADATA_SEGMENT_BYTES && marker >= 0xe0 && marker <= 0xef) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG metadata segment exceeds the structural limit.' } }
    const payload = bytes.subarray(payloadStart, offset + length)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const precision = payload[0]
      const height = (payload[1] << 8) | payload[2]
      const width = (payload[3] << 8) | payload[4]
      const componentCount = payload[5]
      const isProgressive = marker >= 0xc2 && marker <= 0xc3
      const expectedLength = 6 + componentCount * 3
      if (payloadLength < 6 || precision !== 8 || width === 0 || height === 0 || componentCount < 1 || componentCount > 4 || payloadLength !== expectedLength) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Malformed JPEG frame header.' } }
      const components = new Map<number, { dc: boolean; ac: boolean }>()
      for (let index = 0; index < componentCount; index++) {
        const base = 6 + index * 3
        const id = payload[base]
        const sampling = payload[base + 1]
        const quant = payload[base + 2]
        if (components.has(id) || id === 0 || (sampling >> 4) === 0 || (sampling & 0x0f) === 0 || (sampling >> 4) > 4 || (sampling & 0x0f) > 4 || quant > 3) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Invalid JPEG frame component.' } }
        components.set(id, { dc: false, ac: false })
      }
      frameComponents = components
      progressive = isProgressive
      sawFrame = true
    }
    if (marker === 0xda) {
      const count = payload[0]
      const expectedLength = 1 + count * 2 + 3
      if (!sawFrame || count < 1 || count > frameComponents.size || payloadLength !== expectedLength) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Malformed JPEG scan header.' } }
      const seen = new Set<number>()
      for (let index = 0; index < count; index++) {
        const base = 1 + index * 2
        const component = payload[base]
        const tables = payload[base + 1]
        if (seen.has(component) || !frameComponents.has(component) || (tables >> 4) > 3 || (tables & 0x0f) > 3) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Invalid JPEG scan component.' } }
        seen.add(component)
      }
      const spectralStart = payload[1 + count * 2]
      const spectralEnd = payload[2 + count * 2]
      const approximation = payload[3 + count * 2]
      if (spectralStart > 63 || spectralEnd > 63 || spectralStart > spectralEnd || (approximation >> 4) > 13 || (approximation & 0x0f) > 13 || (!progressive && (spectralStart !== 0 || spectralEnd !== 63 || approximation !== 0))) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'Invalid JPEG scan parameters.' } }
      sawScan = true
    }
    const classified = segmentCategory(marker, payload)
    const ordinalKey = classified.category ?? classified.kind
    const ordinal = counts.get(ordinalKey) ?? 0
    counts.set(ordinalKey, ordinal + 1)
    const target = classified.category && classified.classification ? { id: `jpeg-${classified.category === 'unknown' ? `app-${marker.toString(16)}` : classified.category}-${ordinal}`, formatId: 'jpeg', kind: 'jpeg-segment' as const, typeId: `jpeg-marker-${marker.toString(16)}`, marker, category: classified.category, scope: classified.category === 'comment' ? { formatId: 'jpeg', scopeId: 'jpeg-com' } : undefined, classification: classified.classification, removable: classified.removable, reason: classified.reason ?? 'Preserved by structural policy.', ordinal, startOffset, endOffset: offset + length } : undefined
    segments.push({ index: segments.length, kind: classified.kind, marker, startOffset, endOffset: offset + length, payloadLength, target })
    if (marker >= 0xe0 && marker <= 0xef) metadataBytes += payloadLength
    if (metadataBytes > JPEG_MAX_TOTAL_METADATA_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG metadata exceeds the structural limit.' } }
    if (marker === APP1 && ascii(payload, 0, 6) === 'Exif\0\0') fields.push(...exifFields(payload))
    else if (marker === APP1 && ascii(payload, 0, 29).startsWith('http://ns.adobe.com/xap/1.0/')) fields.push(field('xmp-present', 'XMP metadata', 'XMP', 'Present', 'UNKNOWN'))
    else if (marker === APP2 && ascii(payload, 0, 12) === 'ICC_PROFILE\0') fields.push(field('icc-profile', 'ICC color profile', 'other', 'Present', 'PROTECTED'))
    else if (marker === COM) fields.push(field(`comment-${ordinal}`, 'JPEG comment', 'other', `Present (${payload.length} bytes)`, 'SAFE_TO_REMOVE'))
    offset += length
    if (marker === 0xda) {
      const scan = findScanMarker(bytes, offset, signal)
      if (!scan.ok) return scan
      const current = segments[segments.length - 1]
      segments[segments.length - 1] = { ...current, endOffset: scan.value.markerOffset }
      offset = scan.value.markerOffset
    }
  }
  if (!sawEoi) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'JPEG stream has no EOI marker.' } }
  if (!sawFrame || !sawScan) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'JPEG stream has no valid frame and scan.' } }
  if (offset !== bytes.length) return { ok: false, error: { code: 'PROCESSING_FAILED', message: 'JPEG stream contains trailing bytes after EOI.' } }
  return { ok: true, value: { fields, inventory: { segments, inputSize: bytes.byteLength, sourceFingerprint: '' } } }
}

export function jpegEvidenceFromInspection(result: InspectionResult): readonly EvidenceRecord[] {
  return result.fields.map(fieldValue => ({
    id: fieldValue.id,
    label: fieldValue.label,
    category: fieldValue.category,
    state: fieldValue.value === undefined || fieldValue.value === '' ? 'unknown' : 'detected',
    safety: fieldValue.classification === 'SAFE_TO_REMOVE' ? 'safe-to-remove' : fieldValue.classification === 'EDITABLE' ? 'editable' : fieldValue.classification === 'PROTECTED' ? 'protected' : fieldValue.classification === 'UNSUPPORTED' ? 'unsupported' : 'unknown',
    explanation: fieldValue.value || `${fieldValue.label} was not established by the local inspection.`,
    source: 'local-inspection',
    targetId: fieldValue.classification === 'SAFE_TO_REMOVE' ? `jpeg-comment-${fieldValue.id.replace(/^comment-/, '')}` : undefined,
    confidence: 'high',
  }))
}

export async function inspectJpeg(input: LocalInput, signal?: AbortSignal): Promise<BoundaryResult<InspectionResult>> {
  const descriptor = input.descriptor
  if (descriptor.size !== undefined && descriptor.size > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the inspection size limit.' } }
  const bytes = await input.read(undefined, signal)
  if (!bytes.ok) return bytes
  if (bytes.value.byteLength > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the inspection size limit.' } }
  const parsed = inspectSegments(bytes.value, signal)
  if (!parsed.ok) return parsed
  return { ok: true, value: { kind: 'inspection', status: 'success', input: { filename: descriptor.filename, mimeType: descriptor.mimeType, size: descriptor.size ?? bytes.value.byteLength }, format: { extension: descriptor.filename.split('.').pop()?.toLowerCase(), mimeType: 'image/jpeg', state: 'supported' }, fields: parsed.value.fields, warnings: parsed.value.fields.length ? [] : ['No supported metadata segments were found.'], analyzed: true } }
}

export async function createJpegRemovalPlan(input: LocalInput, inventory: JpegStructuralInventory, requestedTargetIds: readonly string[], policy: SafetyPolicy = phaseOneSafetyPolicy): Promise<BoundaryResult<RemovalPlan>> {
  const source = await input.read()
  if (!source.ok) return source
  const sourceHash = await fingerprint(source.value)
  if (!sourceHash.ok) return sourceHash
  if (inventory.sourceFingerprint && inventory.sourceFingerprint !== sourceHash.value) return { ok: false, error: { code: 'INVALID_INPUT', message: 'JPEG source changed since structural planning.' } }
  const requested = new Set(requestedTargetIds)
  const targets = inventory.segments.flatMap(segment => segment.target ? [segment.target] : [])
  const removableTargetIds = targets.filter(target => canAuthorizeRemoval(target, policy) && requested.has(target.id)).map(target => target.id)
  const preservedTargetIds = targets.filter(target => !removableTargetIds.includes(target.id)).map(target => target.id)
  const unknownRequests = requestedTargetIds.filter(id => !targets.some(target => target.id === id))
  const warnings = targets.filter(target => !target.removable).map(target => `${target.id}: ${target.reason}`)
  if (unknownRequests.length) warnings.push(...unknownRequests.map(id => `${id}: target was not found in the structural inventory.`))
  return { ok: true, value: { id: `plan-${input.descriptor.id}-${inventory.inputSize}-${sourceHash.value.slice(0, 16)}`, status: removableTargetIds.length ? 'ready' : 'unsupported', identity: JPEG_PROCESSING_IDENTITY, input: input.descriptor, sourceFingerprint: sourceHash.value, targets, removableTargetIds, preservedTargetIds, warnings, requiresApproval: true, removableFieldIds: [], preservedFieldIds: [], removalWitnesses: targets.filter(target => removableTargetIds.includes(target.id)).map(target => ({ sourceFingerprint: sourceHash.value, targetId: target.id, ordinal: target.ordinal, startOffset: target.startOffset, endOffset: target.endOffset, marker: target.marker!, rangeLength: target.endOffset - target.startOffset })) } }
}

export async function planJpegRemoval(input: LocalInput, requestedTargetIds: readonly string[], _policyName: string, signal?: AbortSignal): Promise<BoundaryResult<RemovalPlan>> {
  const inventory = await inspectJpegStructure(input, signal)
  if (!inventory.ok) return inventory
  return createJpegRemovalPlan(input, inventory.value, requestedTargetIds, phaseOneSafetyPolicy)
}

export async function removeJpegCom(input: LocalInput, plan: RemovalPlan, approval: RemovalApproval, signal?: AbortSignal): Promise<BoundaryResult<ProcessingResult>> {
  const invalid = { ok: false as const, error: { code: 'INVALID_INPUT' as const, message: 'Removal approval is invalid.' } }
  if (!validateRemovalApproval(approval, plan) || approval.inputId !== input.descriptor.id || approval.sourceFingerprint !== plan.sourceFingerprint || new Set(approval.approvedTargetIds).size !== approval.approvedTargetIds.length) return invalid
  const approved = new Set(approval.approvedTargetIds)
  const targets = plan.targets.filter(target => approved.has(target.id))
  if (!targets.length || targets.some(target => target.kind !== 'jpeg-segment' || target.category !== 'comment' || !canAuthorizeRemoval(target, phaseOneSafetyPolicy))) return invalid
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Removal was cancelled.' } }
  const bytes = await input.read(undefined, signal)
  if (!bytes.ok) return bytes
  if (bytes.value.byteLength > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the processing size limit.' } }
  const parsed = inspectSegments(bytes.value, signal)
  if (!parsed.ok) return parsed
  const currentHash = await fingerprint(bytes.value, signal)
  if (!currentHash.ok) return currentHash
  if (currentHash.value !== plan.sourceFingerprint) return { ok: false, error: { code: 'INVALID_INPUT', message: 'JPEG source changed since approval.' } }
  const currentIds = new Set(parsed.value.inventory.segments.flatMap(segment => segment.target ? [segment.target.id] : []))
  const witnesses = plan.removalWitnesses.filter(witness => approved.has(witness.targetId))
  if (witnesses.length !== approved.size || witnesses.some(witness => {
    const target = parsed.value.inventory.segments.find(segment => segment.target?.id === witness.targetId)?.target
    return !target || target.ordinal !== witness.ordinal || target.startOffset !== witness.startOffset || target.endOffset !== witness.endOffset || target.marker !== witness.marker || witness.rangeLength !== witness.endOffset - witness.startOffset || witness.sourceFingerprint !== plan.sourceFingerprint
  })) return invalid
  if (targets.some(target => !currentIds.has(target.id))) return invalid
  const ranges = new Set(targets.map(target => parsed.value.inventory.segments.find(segment => segment.target?.id === target.id)?.startOffset))
  const outputParts: Uint8Array[] = []
  const removalTrace: RemovalTraceEntry[] = []
  let size = 0
  for (const segment of parsed.value.inventory.segments) {
    if (ranges.has(segment.startOffset)) {
      const target = segment.target
      const witness = target ? plan.removalWitnesses.find(candidate => candidate.targetId === target.id) : undefined
      if (!target || !witness || !approved.has(target.id) || witness.ordinal !== target.ordinal || witness.startOffset !== segment.startOffset || witness.endOffset !== segment.endOffset || witness.marker !== segment.marker || witness.rangeLength !== segment.endOffset - segment.startOffset || witness.sourceFingerprint !== plan.sourceFingerprint) return invalid
      removalTrace.push({ sourceFingerprint: currentHash.value, targetId: target.id, ordinal: target.ordinal, startOffset: segment.startOffset, endOffset: segment.endOffset, marker: segment.marker, rangeLength: segment.endOffset - segment.startOffset })
      continue
    }
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
  if (removalTrace.length !== targets.length || removalTrace.some((trace, index) => trace.targetId !== targets[index].id)) return invalid
  const artifact = createMemoryArtifact(output, input.descriptor.filename.replace(/\.(?:jpe?g)$/i, '') + '_notrace.jpg', 'image/jpeg')
  return { ok: true, value: { kind: 'processing', status: 'success', input: { filename: input.descriptor.filename, mimeType: input.descriptor.mimeType, size: input.descriptor.size }, output: { filename: artifact.filename, created: true, artifact }, outputVerification: 'not-run', removalTrace, removedTargetIds: targets.map(target => target.id), preservedTargetIds: plan.targets.filter(target => !approved.has(target.id)).map(target => target.id), warnings: ['Output created in memory. Independent verification has not been performed.'] } }
}

export async function inspectJpegStructure(input: LocalInput, signal?: AbortSignal): Promise<BoundaryResult<JpegStructuralInventory>> {
  const descriptor = input.descriptor
  if (descriptor.size !== undefined && descriptor.size > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the inspection size limit.' } }
  if (signal?.aborted) return { ok: false, error: { code: 'CANCELLED', message: 'Inspection was cancelled.' } }
  const bytes = await input.read(undefined, signal)
  if (!bytes.ok) return bytes
  if (bytes.value.byteLength > JPEG_MAX_INSPECTION_BYTES) return { ok: false, error: { code: 'LIMIT_EXCEEDED', message: 'JPEG input exceeds the inspection size limit.' } }
  const parsed = inspectSegments(bytes.value, signal)
  if (!parsed.ok) return parsed
  const sourceHash = await fingerprint(bytes.value, signal)
  if (!sourceHash.ok) return sourceHash
  return { ok: true, value: { ...parsed.value.inventory, sourceFingerprint: sourceHash.value } }
}

export const jpegContract: AdapterContract = {
  conformance: jpegConformance,
  evidence: jpegEvidenceFromInspection,
  inspect: async (context: ContractOperationContext) => inspectJpeg(context.input, context.signal),
  planRemoval: async (context: ContractOperationContext, targetIds) => planJpegRemoval(context.input, targetIds, 'contract', context.signal),
  executeRemoval: async (context, plan, approval) => removeJpegCom(context.input, plan, approval, context.signal),
  verifyRemoval: async (context, output, plan, approval) => verifyJpegOutputIndependently(context.input, output, plan, approval, context.signal),
}

export const jpegAdapter: FormatAdapter & { inspect: typeof inspectJpeg } = {
  id: 'jpeg-inspection',
  role: 'transformer',
  formatId: 'jpeg', engineId: 'notrace-jpeg', engineVersion: '1', capabilityKey: 'jpeg:remove-com', verifierCompatibilityKey: 'notrace-jpeg-com-v1', verificationCheckIds: JPEG_VERIFICATION_CHECK_IDS,
  probe: async (input, signal) => { const prefix = await probePrefix(input, 2, signal); if (!prefix.ok) return prefix; return prefix.value.length === 2 && prefix.value[0] === 0xff && prefix.value[1] === 0xd8 ? { ok: true, value: { formatId: 'jpeg', mediaType: 'image/jpeg', confidence: 'structural' as const } } : { ok: false, error: { code: 'UNSUPPORTED' as const, message: 'Input is not a JPEG stream.' } } },
  capability: { extensions: ['jpg', 'jpeg'], mimeTypes: ['image/jpeg'], operations: ['inspect', 'remove'] },
  conformance: jpegConformance,
  evidence: jpegEvidenceFromInspection,
  contract: jpegContract,
  inspect: (input, signal) => jpegContract.inspect!({ input, descriptor: input.descriptor, signal }),
  planRemoval: (input, targetIds, policy, signal) => jpegContract.planRemoval!({ input, descriptor: input.descriptor, signal }, targetIds),
  remove: (input, plan, approval, signal) => jpegContract.executeRemoval!({ input, descriptor: input.descriptor, signal }, plan, approval),
}
