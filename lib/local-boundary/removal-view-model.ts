import type { RemovalPlan, RemovalTargetCategory } from '../processing-core/domain/operation'

export type RemovalTargetViewModel = Readonly<{
  id: string
  label: string
  category: RemovalTargetCategory
  capability: 'Removable' | 'Preserved' | 'Protected' | 'Unsupported'
  selectable: boolean
  reason: string
}>

const labels: Record<RemovalTargetCategory, string> = {
  comment: 'JPEG comment',
  exif: 'EXIF metadata',
  xmp: 'XMP metadata',
  icc: 'ICC color profile',
  unknown: 'Unknown APP segment',
}

export function toRemovalTargetViewModels(plan: RemovalPlan): RemovalTargetViewModel[] {
  return plan.targets.map(target => {
    const selectable = target.category === 'comment' && target.removable && target.classification === 'SAFE_TO_REMOVE' && plan.removableTargetIds.includes(target.id)
    return { id: target.id, label: labels[target.category], category: target.category, capability: selectable ? 'Removable' : target.category === 'icc' ? 'Protected' : target.category === 'unknown' ? 'Unsupported' : 'Preserved', selectable, reason: target.reason }
  })
}
