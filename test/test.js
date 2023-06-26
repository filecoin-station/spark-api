import { createHandler } from '../index.js'
import http from 'node:http'
import { once } from 'node:events'
import assert, { AssertionError } from 'node:assert'
import pg from 'pg'

const { DATABASE_URL } = process.env
const walletAddress = 'f1abc'

const assertResponseStatus = async (res, status) => {
  if (res.status !== status) {
    throw new AssertionError({
      actual: res.status,
      expected: status,
      message: await res.text()
    })
  }
}

describe('Routes', () => {
  let client
  let server
  let spark

  before(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    const handler = await createHandler({
      client,
      logger: {
        info () {},
        error (...args) { console.error(...args) }
      }
    })
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
      await assertResponseStatus(res, 200)
      assert.strictEqual(await res.text(), 'Hello World!')
    })
  })
  describe('POST /retrievals', () => {
    it('creates a retrieval', async () => {
      const res = await fetch(`${spark}/retrievals`, { method: 'POST' })
      await assertResponseStatus(res, 200)
      const body = await res.json()
      assert.strictEqual(typeof body.id, 'number')
      assert.strictEqual(typeof body.cid, 'string')
      assert.strictEqual(typeof body.providerAddress, 'string')
      assert.strictEqual(typeof body.protocol, 'string')
    })
    it('uses random retrieval templates', async () => {
      const makeRequest = async () => {
        const res = await fetch(`${spark}/retrievals`, { method: 'POST' })
        await assertResponseStatus(res, 200)
        const { cid } = await res.json()
        return cid
      }

      const firstCID = await makeRequest()
      for (let i = 0; i < 100; i++) {
        const nextCID = await makeRequest()
        if (nextCID !== firstCID) {
          // Different requests returned different CIDs - the test passed.
          return
        }
      }
      throw new Error('All requests returned the same CID')
    })
    it('handles versions', async () => {
      const res = await fetch(`${spark}/retrievals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sparkVersion: '1.2.3',
          zinniaVersion: '2.3.4'
        })
      })
      await assertResponseStatus(res, 200)
      const body = await res.json()
      const { rows: [retrievalRow] } = await client.query(
        'SELECT * FROM retrievals WHERE id = $1',
        [body.id]
      )
      assert.strictEqual(retrievalRow.spark_version, '1.2.3')
      assert.strictEqual(retrievalRow.zinnia_version, '2.3.4')
    })
    it('validates versions', async () => {
      const res = await fetch(`${spark}/retrievals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sparkVersion: 0 })
      })
      await assertResponseStatus(res, 400)
      assert.strictEqual(
        await res.text(),
        'Invalid .sparkVersion - should be a string'
      )
    })
  })
  describe('PATCH /retrievals/:id', () => {
    it('updates a retrieval', async () => {
      const createRequest = await fetch(`${spark}/retrievals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sparkVersion: '1.2.3',
          zinniaVersion: '2.3.4'
        })
      })
      const { id: retrievalId } = await createRequest.json()
      const { rows } = await client.query(`
        SELECT success
        FROM retrieval_results
        WHERE retrieval_id = $1
      `, [
        retrievalId
      ])
      assert.strictEqual(rows.length, 0)
      const result = {
        success: true,
        walletAddress,
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100
      }
      const updateRequest = await fetch(
        `${spark}/retrievals/${retrievalId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        }
      )
      await assertResponseStatus(updateRequest, 200)
      const { rows: [retrievalResultRow] } = await client.query(`
        SELECT *
        FROM retrieval_results
        WHERE retrieval_id = $1
      `, [
        retrievalId
      ])
      assert.strictEqual(retrievalResultRow.success, result.success)
      assert.strictEqual(retrievalResultRow.wallet_address, walletAddress)
      assert.strictEqual(
        retrievalResultRow.start_at.toJSON(),
        result.startAt.toJSON()
      )
      assert.strictEqual(retrievalResultRow.status_code, result.statusCode)
      assert.strictEqual(
        retrievalResultRow.first_byte_at.toJSON(),
        result.firstByteAt.toJSON()
      )
      assert.strictEqual(
        retrievalResultRow.end_at.toJSON(),
        result.endAt.toJSON()
      )
      assert.strictEqual(retrievalResultRow.byte_length, result.byteLength)
    })
    it('handles invalid JSON', async () => {
      const createRequest = await fetch(
        `${spark}/retrievals`,
        { method: 'POST' }
      )
      const { id: retrievalId } = await createRequest.json()
      const res = await fetch(
        `${spark}/retrievals/${retrievalId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: '{"invalid"}'
        }
      )
      await assertResponseStatus(res, 400)
      assert.strictEqual(await res.text(), 'Invalid JSON Body')
    })
    it('handles retrieval id not a number', async () => {
      const res = await fetch(
        `${spark}/retrievals/some-id`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            walletAddress,
            startAt: new Date(),
            statusCode: 200,
            firstByteAt: new Date(),
            endAt: new Date(),
            byteLength: 100
          })
        }
      )
      await assertResponseStatus(res, 400)
      assert.strictEqual(await res.text(), 'Invalid Retrieval ID')
    })
    it('handles retrieval not found', async () => {
      const res = await fetch(
        `${spark}/retrievals/0`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            walletAddress,
            startAt: new Date(),
            statusCode: 200,
            firstByteAt: new Date(),
            endAt: new Date(),
            byteLength: 100
          })
        }
      )
      await assertResponseStatus(res, 404)
      assert.strictEqual(await res.text(), 'Retrieval Not Found')
    })
    it('handles request body too large', async () => {
      const createRequest = await fetch(
        `${spark}/retrievals`,
        { method: 'POST' }
      )
      const { id: retrievalId } = await createRequest.json()
      const res = await fetch(
        `${spark}/retrievals/${retrievalId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.alloc(100 * 1024 + 1)
        }
      )
      await assertResponseStatus(res, 413)
      assert.strictEqual(await res.text(), 'request entity too large')
    })
    it('validates missing columns', async () => {
      const createRequest = await fetch(
        `${spark}/retrievals`,
        { method: 'POST' }
      )
      const { id: retrievalId } = await createRequest.json()
      const res = await fetch(
        `${spark}/retrievals/${retrievalId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // success: true,
            walletAddress,
            startAt: new Date(),
            statusCode: 200,
            firstByteAt: new Date(),
            endAt: new Date(),
            byteLength: 100
          })
        }
      )
      await assertResponseStatus(res, 400)
      assert.strictEqual(
        await res.text(),
        'Invalid .success - should be a boolean'
      )
    })
    it('validates column types', async () => {
      const createRequest = await fetch(
        `${spark}/retrievals`,
        { method: 'POST' }
      )
      const { id: retrievalId } = await createRequest.json()
      const res = await fetch(
        `${spark}/retrievals/${retrievalId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: 'nope',
            walletAddress,
            startAt: new Date(),
            statusCode: 200,
            firstByteAt: new Date(),
            endAt: new Date(),
            byteLength: 100
          })
        }
      )
      await assertResponseStatus(res, 400)
      assert.strictEqual(
        await res.text(),
        'Invalid .success - should be a boolean'
      )
    })
    it('validates dates', async () => {
      const createRequest = await fetch(
        `${spark}/retrievals`,
        { method: 'POST' }
      )
      const { id: retrievalId } = await createRequest.json()
      const res = await fetch(
        `${spark}/retrievals/${retrievalId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            walletAddress,
            startAt: 'not-iso',
            statusCode: 200,
            firstByteAt: new Date(),
            endAt: new Date(),
            byteLength: 100
          })
        }
      )
      await assertResponseStatus(res, 400)
      assert.strictEqual(
        await res.text(),
        'Invalid .startAt - should be a date'
      )
    })
    it('accepts some null values', async () => {
      const createRequest = await fetch(
        `${spark}/retrievals`,
        { method: 'POST' }
      )
      const { id: retrievalId } = await createRequest.json()
      const res = await fetch(
        `${spark}/retrievals/${retrievalId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: true,
            walletAddress,
            startAt: new Date(),
            statusCode: 200,
            firstByteAt: null,
            endAt: null,
            byteLength: null
          })
        }
      )
      await assertResponseStatus(res, 200)
    })
    it('ignores duplicate submissions', async () => {
      const createRequest = await fetch(
        `${spark}/retrievals`,
        { method: 'POST' }
      )
      const { id: retrievalId } = await createRequest.json()
      {
        const updateRequest = await fetch(
          `${spark}/retrievals/${retrievalId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              success: true,
              walletAddress,
              startAt: new Date(),
              statusCode: 200,
              firstByteAt: new Date(),
              endAt: new Date(),
              byteLength: 100
            })
          }
        )
        assert.strictEqual(updateRequest.status, 200)
      }
      {
        const updateRequest = await fetch(
          `${spark}/retrievals/${retrievalId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              success: true,
              walletAddress,
              startAt: new Date(),
              statusCode: 200,
              firstByteAt: new Date(),
              endAt: new Date(),
              byteLength: 100
            })
          }
        )
        assert.strictEqual(updateRequest.status, 409)
      }
      const { rows: [retrievalRow] } = await client.query(`
        SELECT success
        FROM retrieval_results
        WHERE retrieval_id = $1
      `, [
        retrievalId
      ])
      assert.strictEqual(retrievalRow.success, true)
    })
  })
  describe('GET /retrievals/:id', () => {
    it('gets a fresh retrieval', async () => {
      const createRequest = await fetch(`${spark}/retrievals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sparkVersion: '1.2.3',
          zinniaVersion: '2.3.4'
        })
      })
      const {
        id: retrievalId,
        cid,
        providerAddress,
        protocol
      } = await createRequest.json()
      const res = await fetch(`${spark}/retrievals/${retrievalId}`)
      await assertResponseStatus(res, 200)
      const body = await res.json()
      assert.strictEqual(body.id, retrievalId)
      assert.strictEqual(body.cid, cid)
      assert.strictEqual(body.providerAddress, providerAddress)
      assert.strictEqual(body.protocol, protocol)
      assert.strictEqual(body.sparkVersion, '1.2.3')
      assert.strictEqual(body.zinniaVersion, '2.3.4')
      assert(body.createdAt)
      assert.strictEqual(body.finishedAt, null)
      assert.strictEqual(body.success, null)
      assert.strictEqual(body.startAt, null)
      assert.strictEqual(body.statusCode, null)
      assert.strictEqual(body.firstByteAt, null)
      assert.strictEqual(body.endAt, null)
      assert.strictEqual(body.byteLength, null)
    })
    it('gets a completed retrieval', async () => {
      const createRequest = await fetch(`${spark}/retrievals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sparkVersion: '1.2.3',
          zinniaVersion: '2.3.4'
        })
      })
      const {
        id: retrievalId,
        cid,
        providerAddress,
        protocol
      } = await createRequest.json()
      const retrieval = {
        success: true,
        walletAddress,
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100
      }
      const updateRequest = await fetch(
        `${spark}/retrievals/${retrievalId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(retrieval)
        }
      )
      assert(updateRequest.ok)
      const res = await fetch(`${spark}/retrievals/${retrievalId}`)
      await assertResponseStatus(res, 200)
      const body = await res.json()
      assert.strictEqual(body.id, retrievalId)
      assert.strictEqual(body.cid, cid)
      assert.strictEqual(body.providerAddress, providerAddress)
      assert.strictEqual(body.protocol, protocol)
      assert.strictEqual(body.sparkVersion, '1.2.3')
      assert.strictEqual(body.zinniaVersion, '2.3.4')
      assert(body.createdAt)
      assert(body.finishedAt)
      assert.strictEqual(body.success, retrieval.success)
      assert.strictEqual(body.startAt, retrieval.startAt.toJSON())
      assert.strictEqual(body.statusCode, retrieval.statusCode)
      assert.strictEqual(body.firstByteAt, retrieval.firstByteAt.toJSON())
      assert.strictEqual(body.endAt, retrieval.endAt.toJSON())
      assert.strictEqual(body.byteLength, retrieval.byteLength)
    })
  })
})
