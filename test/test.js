import { handle } from '../index.js'
import http from 'node:http'
import { once } from 'node:events'
import assert from 'node:assert'

describe('Routes', () => {
  let server
  let spark

  before(async () => {
    server = http.createServer(handle)
    server.listen()
    await once(server, 'listening')
    spark = `http://127.0.0.1:${server.address().port}`
  })

  after(() => {
    server.close()
  })

  describe('GET /', () => {
    it('responds', async () => {
      const res = await fetch(`${spark}/`)
      assert.strictEqual(res.status, 200)
      assert.strictEqual(await res.text(), 'Hello World!')
    })
  })
  describe('GET /retrieval', () => {
    it('responds', async () => {
      const res = await fetch(`${spark}/retrieval`)
      assert.strictEqual(res.status, 200)
      assert.deepStrictEqual(await res.json(), { hello: 'world' })
    })
  })
})
