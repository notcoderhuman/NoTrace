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
  const scope = target.scope as RemovalScope | undefined
  return target.removable && target.classification === 'SAFE_TO_REMOVE' && scope !== undefined && policy.allowedRemovalScopes.includes(scope) && policy.preserveOriginal && policy.failClosed && policy.retainInMemoryOnly && policy.preserveProtectedSegments && policy.preserveUnknownSegments && policy.requireIndependentVerification
}

export function validateRemovalApproval(approval: RemovalApproval, plan: RemovalPlan): boolean {
  if (!approval || !plan || plan.status !== 'ready' || !plan.requiresApproval || approval.planId !== plan.id || approval.inputId !== plan.input.id || approval.sourceFingerprint !== plan.sourceFingerprint || !sameIdentity(approval.identity, plan.identity) || !Number.isSafeInteger(approval.approvedAt) || approval.approvedAt < 0 || !Array.isArray(approval.approvedTargetIds)) return false
  if (approval.approvedTargetIds.length === 0 || new Set(approval.approvedTargetIds).size !== approval.approvedTargetIds.length) return false
  const allowed = new Set(plan.removableTargetIds)
  return approval.approvedTargetIds.every(id => typeof id === 'string' && id.length > 0 && allowed.has(id))
}

function sameIdentity(left: RemovalApproval['identity'], right: RemovalPlan['identity']): boolean {
  return left.formatId === right.formatId && left.engineId === right.engineId && left.engineVersion === right.engineVersion && left.capabilityKey === right.capabilityKey && left.policyId === right.policyId && left.policyVersion === right.policyVersion && left.verifierCompatibilityKey === right.verifierCompatibilityKey
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
