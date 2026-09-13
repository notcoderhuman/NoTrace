import type { MetadataField, SafetyClassification } from '../domain/metadata'
import type { RemovalApproval, RemovalPlan, RemovalTarget } from '../domain/operation'
import type { RemovalScope, SafetyPolicy } from './safety-policy'

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

export function canAuthorizeRemoval(target: RemovalTarget, policy: SafetyPolicy): boolean {
  const scope: RemovalScope | undefined = target.category === 'comment' ? 'jpeg-com' : undefined
  return target.kind === 'jpeg-segment' && target.removable && target.classification === 'SAFE_TO_REMOVE' && scope !== undefined && policy.allowedRemovalScopes.includes(scope) && policy.preserveOriginal && policy.failClosed && policy.retainInMemoryOnly && policy.preserveProtectedSegments && policy.preserveUnknownSegments && policy.requireIndependentVerification
}

export function validateRemovalApproval(approval: RemovalApproval, plan: RemovalPlan): boolean {
  if (approval.planId !== plan.id || approval.inputId !== plan.input.id || !Number.isSafeInteger(approval.approvedAt) || approval.approvedAt < 0) return false
  const allowed = new Set(plan.removableTargetIds)
  return approval.approvedTargetIds.every(id => allowed.has(id))
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
