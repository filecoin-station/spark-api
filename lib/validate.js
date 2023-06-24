import assert from 'http-assert'

export const validate = (obj, key, { type, required }) => {
  if (!required && (!Object.keys(obj).includes(key) || obj[key] === null)) {
    return
  }
  const message = `Invalid .${key} - should be a ${type}`
  if (type === 'date') {
    const date = new Date(obj[key])
    assert(!isNaN(date.getTime()), 400, message)
  } else {
    assert.strictEqual(typeof obj[key], type, 400, message)
  }
}
