export type LimitEnforcement = 'ENFORCED' | 'ADVISORY' | 'UNSUPPORTED'
export type LimitCapability = Readonly<{ name: string; enforcement: LimitEnforcement; rationale: string }>

/** Honest support matrix for the current in-process browser runtime. */
export const currentLimitCapabilities: readonly LimitCapability[] = Object.freeze([
  { name: 'maxInputBytes', enforcement: 'ENFORCED', rationale: 'Browser input and JPEG boundary checks enforce the byte bound.' },
  { name: 'maxOutputBytes', enforcement: 'ENFORCED', rationale: 'JPEG construction and verification enforce bounded output.' },
  { name: 'maxOutputArtifacts', enforcement: 'ENFORCED', rationale: 'A real operation publishes at most one verified artifact.' },
  { name: 'maxDurationMs', enforcement: 'ADVISORY', rationale: 'Abort signals are cooperative and cannot stop synchronous hostile code.' },
  { name: 'maxMemoryBytes', enforcement: 'UNSUPPORTED', rationale: 'In-process JavaScript cannot impose a hard heap cap.' },
  { name: 'hardCpuTime', enforcement: 'UNSUPPORTED', rationale: 'Hard CPU termination requires a worker or process host.' },
])
