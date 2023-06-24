import assert from 'http-assert'

export const validate = (obj, key, { type, required }) => {
  const message = `Invalid .${key} - should be a ${type}`
  const status = 400
  const exists = Object.keys(obj).includes(key) && obj[key] !== null

  if (required && !exists) {
    assert(false, status, message)
  } else if (exists) {
    if (type === 'date') {
      const date = new Date(obj[key])
      assert(!isNaN(date.getTime()), status, message)
    } else {
      assert.strictEqual(typeof obj[key], type, status, message)
    }
  }
}
