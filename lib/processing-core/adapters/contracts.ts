import type { OutputArtifact } from '../domain/artifact'
import type { InspectionResult } from '../domain/metadata'
import type { LocalInput } from '../domain/input'
import type { ProcessingResult, RemovalApproval, RemovalPlan } from '../domain/operation'
import type { BoundaryResult, VerificationResult } from '../domain/result'

/** Stable identity for a NoTrace capability; external engines never own this identity. */
export type CapabilityKey = `${string}:${'inspect' | 'transform' | 'verify'}`

export type OperationToken = Readonly<{
  id: string
  generation: number
}>

export type ExecutionLimits = Readonly<{
  maxInputBytes: number
  maxOutputBytes: number
  maxMetadataBytes?: number
  maxItems?: number
  maxDurationMs?: number
  maxMemoryBytes?: number
}>

/** Context owned by NoTrace and passed to an implementation component. */
export type AdapterExecutionContext = Readonly<{
  signal?: AbortSignal
  token?: OperationToken
  limits: ExecutionLimits
  localOnly: true
}>

export type InspectionAdapter = Readonly<{
  id: string
  capability: CapabilityKey
  inspect(input: LocalInput, context: AdapterExecutionContext): Promise<BoundaryResult<InspectionResult>>
}>

export type TransformationAdapter = Readonly<{
  id: string
  capability: CapabilityKey
  transform(input: LocalInput, plan: RemovalPlan, approval: RemovalApproval, context: AdapterExecutionContext): Promise<BoundaryResult<ProcessingResult>>
}>

export type Verifier = Readonly<{
  id: string
  capability: CapabilityKey
  /** Must independently scan the output; it may not delegate to transformation logic or consume transformer decisions/state. */
  independence: 'structural-independent'
  verify(input: LocalInput, output: OutputArtifact, plan: RemovalPlan, approval: RemovalApproval, context: AdapterExecutionContext): Promise<BoundaryResult<VerificationResult>>
}>

/**
 * A normalized implementation bundle. The implementation may be replaced;
 * policy, approval, verification authority, and ownership remain NoTrace-owned.
 */
export type EngineContract = Readonly<{
  format: string
  inspection?: InspectionAdapter
  transformation?: TransformationAdapter
  verifier?: Verifier
}>

export type EngineCapabilityRegistry = Readonly<{
  register(engine: EngineContract): BoundaryResult<void>
  resolve(format: string, capability: 'inspect' | 'transform' | 'verify'): BoundaryResult<InspectionAdapter | TransformationAdapter | Verifier>
  list(): readonly EngineContract[]
}>

export function createEngineCapabilityRegistry(): EngineCapabilityRegistry {
  const engines: EngineContract[] = []
  return {
    register(engine) {
      if (!engine.format.trim()) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Engine format identity is required.' } }
      if (!engine.inspection && !engine.transformation && !engine.verifier) return { ok: false, error: { code: 'INVALID_INPUT', message: 'An engine must expose at least one capability.' } }
      if (engine.verifier && engine.verifier.independence !== 'structural-independent') return { ok: false, error: { code: 'INVALID_INPUT', message: 'Verifier independence contract is required.' } }
      const capabilities = [engine.inspection, engine.transformation, engine.verifier].filter(Boolean) as Array<InspectionAdapter | TransformationAdapter | Verifier>
      if (capabilities.some(capability => capability.capability.split(':')[0] !== engine.format || !capability.id.trim())) return { ok: false, error: { code: 'INVALID_INPUT', message: 'Engine capability identity does not match its format.' } }
      if (engines.some(existing => existing.format === engine.format)) return { ok: false, error: { code: 'INVALID_INPUT', message: `Engine '${engine.format}' is already registered.` } }
      engines.push(engine)
      return { ok: true, value: undefined }
    },
    resolve(format, capability) {
      const engine = engines.find(candidate => candidate.format === format)
      const value = capability === 'inspect' ? engine?.inspection : capability === 'transform' ? engine?.transformation : engine?.verifier
      return value ? { ok: true, value } : { ok: false, error: { code: 'UNSUPPORTED', message: `No ${capability} capability is registered for ${format}.` } }
    },
    list: () => engines.slice(),
  }
}
