import assert from 'node:assert'

export function assertApproximately (actual, expected, delta) {
  assert(Math.abs(actual - expected) < delta,
    `Expected ${actual} to be approximately ${expected} (+/- ${delta})`)
}
