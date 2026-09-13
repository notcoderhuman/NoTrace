import type { LocalInputDescriptor } from './input'

export type FileIdentity = Readonly<{
  filename: string
  extension?: string
  mimeTypeHint?: string
  size?: number
}>

export function fileIdentity(input: LocalInputDescriptor): FileIdentity {
  const filename = input.filename.trim()
  const dot = filename.lastIndexOf('.')
  return {
    filename,
    extension: dot > -1 && dot < filename.length - 1 ? filename.slice(dot + 1).toLowerCase() : undefined,
    mimeTypeHint: input.mimeType,
    size: input.size,
  }
}

export type SupportedState = 'supported' | 'unsupported' | 'unknown'
