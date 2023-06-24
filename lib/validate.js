import assert from 'http-assert'

export const validate = (obj, key, { type, required }) => {
  if (!required && (!Object.keys(obj).includes(key) || obj[key] === null)) {
    return
  }
  if (type === 'date') {
    const date = new Date(obj[key])
    assert(!isNaN(date.getTime()), 400, `Invalid .${key}`)
  } else {
    assert.strictEqual(typeof obj[key], type, 400, `Invalid .${key}`)
  }
}
