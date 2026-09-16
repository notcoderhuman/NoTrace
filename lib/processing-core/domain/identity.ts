/** Stable NoTrace-owned identity carried from planning through publication. */
export type ProcessingIdentity = Readonly<{
  formatId: string
  engineId: string
  engineVersion: string
  capabilityKey: string
  policyId: string
  policyVersion: string
  verifierCompatibilityKey: string
  verifierIndependence?: 'structural-independent'
}>

export function sameProcessingIdentity(a: ProcessingIdentity | undefined, b: ProcessingIdentity | undefined): boolean {
  return Boolean(a && b && a.formatId === b.formatId && a.engineId === b.engineId && a.engineVersion === b.engineVersion && a.capabilityKey === b.capabilityKey && a.policyId === b.policyId && a.policyVersion === b.policyVersion && a.verifierCompatibilityKey === b.verifierCompatibilityKey)
}

export const JPEG_PROCESSING_IDENTITY: ProcessingIdentity = Object.freeze({
  formatId: 'jpeg', engineId: 'notrace-jpeg', engineVersion: '1', capabilityKey: 'jpeg:remove-com', policyId: 'notrace-safe-removal', policyVersion: '1', verifierCompatibilityKey: 'notrace-jpeg-com-v1', verifierIndependence: 'structural-independent',
})
