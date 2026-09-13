import type { MetadataField, SafetyClassification } from '../domain/metadata'

/** Conservative policy: uncertainty always preserves the field. */
export function canRemove(classification: SafetyClassification): boolean {
  return classification === 'SAFE_TO_REMOVE'
}

export function canEdit(classification: SafetyClassification): boolean {
  return classification === 'EDITABLE'
}

export function preserveWhenUncertain(classification: SafetyClassification): boolean {
  return classification === 'UNKNOWN' || classification === 'UNSUPPORTED' || classification === 'PROTECTED'
}

export function classifyRequestedFields(fields: readonly MetadataField[], requestedIds: readonly string[]) {
  const requested = new Set(requestedIds)
  return fields.reduce(
    (result, field) => {
      if (!requested.has(field.id) || !canRemove(field.classification)) result.preservedFieldIds.push(field.id)
      else result.removableFieldIds.push(field.id)
      return result
    },
    { removableFieldIds: [] as string[], preservedFieldIds: [] as string[] },
  )
}
