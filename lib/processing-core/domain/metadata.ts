export type MetadataCategory = 'EXIF' | 'IPTC' | 'XMP' | 'C2PA' | 'container' | 'other'

export type SafetyClassification =
  | 'SAFE_TO_REMOVE'
  | 'EDITABLE'
  | 'PROTECTED'
  | 'UNKNOWN'
  | 'UNSUPPORTED'

export type MetadataField = Readonly<{
  id: string
  label: string
  category: MetadataCategory
  classification: SafetyClassification
  value?: string
  risk?: 'high' | 'medium' | 'low'
}>

export type InspectionResult = Readonly<{
  kind: 'inspection'
  status: 'success' | 'partial' | 'unsupported' | 'failed'
  input: Readonly<{ filename: string; mimeType?: string; size?: number }>
  format: Readonly<{ extension?: string; mimeType?: string; state: 'supported' | 'unsupported' | 'unknown' }>
  fields: readonly MetadataField[]
  warnings: readonly string[]
  analyzed: false | true
}>
