import { strict as assert } from 'node:assert'
import { currentLimitCapabilities } from './limits'
import { phaseOneSafetyPolicy } from '../classification/safety-policy'

const expected = new Map([
  ['maxInputBytes', 'ENFORCED'], ['maxOutputBytes', 'ENFORCED'], ['maxOutputArtifacts', 'ENFORCED'],
  ['maxDurationMs', 'ADVISORY'], ['maxMemoryBytes', 'UNSUPPORTED'], ['hardCpuTime', 'UNSUPPORTED'],
])
assert.equal(currentLimitCapabilities.length, expected.size)
for (const capability of currentLimitCapabilities) assert.equal(capability.enforcement, expected.get(capability.name))
assert.equal(currentLimitCapabilities.some(capability => capability.name === 'maxMemoryBytes' && capability.enforcement === 'ENFORCED'), false)
assert.equal(currentLimitCapabilities.some(capability => capability.name === 'hardCpuTime' && capability.enforcement === 'ENFORCED'), false)
assert.equal(phaseOneSafetyPolicy.maxFiles, 1)
console.log('Limit capability contract tests passed: 4')
