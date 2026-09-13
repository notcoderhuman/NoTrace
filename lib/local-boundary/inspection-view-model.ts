import type { MetadataItem } from '@/lib/notrace-demo'
import type { InspectionResult, MetadataCategory, SafetyClassification } from '../processing-core/domain/metadata'

const classifications: Record<SafetyClassification, MetadataItem['capability']> = {
  SAFE_TO_REMOVE: 'Safe to remove',
  EDITABLE: 'Editable',
  PROTECTED: 'Protected',
  UNKNOWN: 'Unknown',
  UNSUPPORTED: 'Unsupported',
}

const categories: Record<MetadataCategory, string> = {
  EXIF: 'EXIF',
  IPTC: 'IPTC',
  XMP: 'XMP',
  C2PA: 'C2PA',
  container: 'Other',
  other: 'Other',
}

export function toMetadataItems(result: InspectionResult): MetadataItem[] {
  return result.fields.map(field => ({
    id: field.id,
    label: field.label,
    value: field.value ?? 'Unknown',
    category: categories[field.category],
    capability: classifications[field.classification],
    risk: field.risk ? field.risk[0].toUpperCase() + field.risk.slice(1) as MetadataItem['risk'] : undefined,
  }))
}
