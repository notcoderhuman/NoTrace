import type { LocalInput } from './input'

export type Operation = 'inspect' | 'remove' | 'edit' | 'verify'

export type RemovalRequest = Readonly<{
  input: LocalInput
  fieldIds: readonly string[]
  policy: string
}>

export type RemovalPlan = Readonly<{
  status: 'ready' | 'unsupported' | 'unknown'
  removableFieldIds: readonly string[]
  preservedFieldIds: readonly string[]
  warnings: readonly string[]
}>

export type EditRequest = Readonly<{
  input: LocalInput
  changes: Readonly<Record<string, string>>
}>

export type ProcessingRequest = Readonly<{
  operation: 'remove' | 'edit'
  input: LocalInput
  removal?: RemovalRequest
  edit?: EditRequest
}>

export type ProcessingStatus = 'success' | 'partial' | 'unsupported' | 'failed'

export type ProcessingResult = Readonly<{
  kind: 'processing'
  status: ProcessingStatus
  input: Readonly<{ filename: string; mimeType?: string; size?: number }>
  output?: Readonly<{ filename: string; created: false }>
  warnings: readonly string[]
  report?: import('./result').Report
}>
