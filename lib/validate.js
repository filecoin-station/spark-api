import assert from 'http-assert'
import { ethers } from 'ethers'

export const validate = (obj, key, { type, required }) => {
  const message = `Invalid .${key} - should be a ${type}`
  const status = 400
  const exists = Object.keys(obj).includes(key) && obj[key] !== null

  assert(exists || !required, status, message)
  if (exists) {
    if (type === 'date') {
      const date = new Date(obj[key])
      assert(!isNaN(date.getTime()), status, message)
    } else if (type === 'ethereum address') {
      assert(ethers.isAddress(obj[key]), status, message)
    } else {
      assert.strictEqual(typeof obj[key], type, status, message)
    }
  }
}
