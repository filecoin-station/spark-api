import { createHandler } from '../index.js'
import http from 'node:http'
import { once } from 'node:events'
import assert from 'node:assert'
import pg from 'pg'

const { DATABASE_URL } = process.env

describe('Routes', () => {
  let client
  let server
  let spark

  before(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    const handler = await createHandler(client)
    server = http.createServer(handler)
    server.listen()
    await once(server, 'listening')
    spark = `http://127.0.0.1:${server.address().port}`
  })

  after(() => {
    server.close()
    client.end()
  })

  describe('GET /', () => {
    it('responds', async () => {
      const res = await fetch(`${spark}/`)
      assert.strictEqual(res.status, 200)
      assert.strictEqual(await res.text(), 'Hello World!')
    })
  })
  describe('POST /retrieval', () => {
    it('creates a retrieval', async () => {
      const res = await fetch(`${spark}/retrieval`, { method: 'POST' })
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.strictEqual(typeof body.id, 'number')
      assert.strictEqual(typeof body.cid, 'string')
      assert.strictEqual(typeof body.providerAddress, 'string')
      assert.strictEqual(typeof body.protocol, 'string')
    })
    it('uses random retrieval templates', async () => {
      let lastCid
      for (let i = 0; i < 100; i++) {
        const res = await fetch(`${spark}/retrieval`, { method: 'POST' })
        assert.strictEqual(res.status, 200)
        const body = await res.json()
        if (!lastCid) {
          lastCid = body.cid
        } else if (lastCid !== body.cid) {
          return
        }
      }
      throw new Error('All CIDs were the same')
    })
  })
})
