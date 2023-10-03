import { createHandler } from '../index.js'
import http from 'node:http'
import { once } from 'node:events'
import assert, { AssertionError } from 'node:assert'
import pg from 'pg'
import { maybeCreateSparkRound } from '../lib/round-tracker.js'

const { DATABASE_URL } = process.env
const participantAddress = 'f1abc'
const sparkVersion = '0.12.0' // This must be in sync with the minimum supported client version
const currentSparkRoundNumber = 42n

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
    await maybeCreateSparkRound(client, currentSparkRoundNumber)
    const handler = await createHandler({
      client,
      logger: {
        info () {},
        error (...args) { console.error(...args) }
      },
      async getCurrentRound () {
        return currentSparkRoundNumber
      }
    })
    server = http.createServer(handler)
    server.listen()
    await once(server, 'listening')
    spark = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    server.closeAllConnections()
    server.close()
    await client.end()
  })

  describe('GET /', () => {
    it('responds', async () => {
      const res = await fetch(`${spark}/`)
      await assertResponseStatus(res, 404)
      assert.strictEqual(await res.text(), 'Not Found')
    })
  })
  describe('POST /retrievals', () => {
    it('creates a retrieval', async () => {
      const res = await fetch(`${spark}/retrievals`, { method: 'POST', body: JSON.stringify({ sparkVersion }) })
      await assertResponseStatus(res, 200)
      const body = await res.json()
      assert.strictEqual(typeof body.id, 'number')
      assert.strictEqual(typeof body.cid, 'string')
      assert.strictEqual(typeof body.providerAddress, 'string')
      assert.strictEqual(typeof body.protocol, 'string')

      const { rows: [retrievalRow] } = await client.query(
        'SELECT * FROM retrievals WHERE id = $1',
        [body.id]
      )
      assert.strictEqual(retrievalRow.created_at_round, '42')
    })
    it('uses random retrieval templates', async () => {
      const makeRequest = async () => {
        const res = await fetch(`${spark}/retrievals`, { method: 'POST', body: JSON.stringify({ sparkVersion }) })
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
    it('rejects outdated clients', async () => {
      const res = await fetch(`${spark}/retrievals`, { method: 'POST' /* no versions */ })
      await assertResponseStatus(res, 400)
      const body = await res.text()
      assert.strictEqual(body, 'OUTDATED CLIENT')
    })
  })
  describe('PATCH /retrievals/:id', () => {
    // This API endpoint is used by old clients which always send walletAddress
    const walletAddress = participantAddress
    it('updates a retrieval', async () => {
      await client.query('DELETE FROM measurements')

      const createRequest = await fetch(`${spark}/retrievals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sparkVersion: '1.2.3',
          zinniaVersion: '2.3.4'
        })
      })
      const { id: retrievalId, ...retrieval } = await createRequest.json()
      const { rows } = await client.query('SELECT success FROM measurements')
      assert.strictEqual(rows.length, 0)
      const result = {
        success: true,
        walletAddress,
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100,
        attestation: 'json.sig'
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
      const { measurementId } = await updateRequest.json()
      const { rows: [retrievalResultRow] } = await client.query(`
        SELECT *
        FROM measurements
        WHERE id = $1
      `, [
        measurementId
      ])
      assert.strictEqual(retrievalResultRow.success, result.success)
      assert.strictEqual(retrievalResultRow.participant_address, participantAddress)
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
      assert.strictEqual(retrievalResultRow.attestation, result.attestation)
      assert.strictEqual(retrievalResultRow.completed_at_round, '42')
      assert.strictEqual(retrievalResultRow.cid, retrieval.cid)
      assert.strictEqual(retrievalResultRow.provider_address, retrieval.providerAddress)
      assert.strictEqual(retrievalResultRow.protocol, retrieval.protocol)
      assert.strictEqual(retrievalResultRow.spark_version, '1.2.3')
      assert.strictEqual(retrievalResultRow.zinnia_version, '2.3.4')
      assert.strictEqual(retrievalResultRow.published_as, null)
    })
    it('handles invalid JSON', async () => {
      const { id: retrievalId } = await givenRetrieval()
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
      const { id: retrievalId } = await givenRetrieval()
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
        { method: 'POST', body: JSON.stringify({ sparkVersion }) }
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
      const { id: retrievalId } = await givenRetrieval()
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
      const { id: retrievalId } = await givenRetrieval()
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
      const { id: retrievalId } = await givenRetrieval()
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
            byteLength: null,
            attestation: null
          })
        }
      )
      await assertResponseStatus(res, 200)
    })

    // Duplicate submissions are ok, because we filter out duplicates in the fraud detection step
    it('allows duplicate submissions', async () => {
      await client.query('DELETE FROM measurements')
      const { id: retrievalId } = await givenRetrieval()
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
              byteLength: 200 // <-- different from the first result
            })
          }
        )
        assert.strictEqual(updateRequest.status, 200)
      }
      const { rows } = await client.query(`
        SELECT byte_length
        FROM measurements
        WHERE participant_address = $1
      `, [
        participantAddress
      ])
      assert.deepStrictEqual(rows.map(r => r.byte_length), [100, 200])
    })
  })
  describe('GET /retrievals/:id', () => {
    it('returns error', async () => {
      const res = await fetch(`${spark}/retrievals/0`)
      await assertResponseStatus(res, 501 /* Not Implemented */)
    })
  })
  describe('POST /measurements', () => {
    it('records a new measurement', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        cid: 'bafytest',
        providerAddress: '/dns4/localhost/tcp/8080',
        protocol: 'graphsync',
        sparkVersion: '1.2.3',
        zinniaVersion: '2.3.4',
        success: true,
        participantAddress,
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100,
        attestation: 'json.sig'
      }

      const createRequest = await fetch(`${spark}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement)
      })
      await assertResponseStatus(createRequest, 200)
      const { id } = await createRequest.json()

      const { rows: [measurementRow] } = await client.query(`
          SELECT *
          FROM measurements
          WHERE id = $1
        `, [
        id
      ])
      assert.strictEqual(measurementRow.success, measurement.success)
      assert.strictEqual(measurementRow.participant_address, participantAddress)
      assert.strictEqual(
        measurementRow.start_at.toJSON(),
        measurement.startAt.toJSON()
      )
      assert.strictEqual(measurementRow.status_code, measurement.statusCode)
      assert.strictEqual(
        measurementRow.first_byte_at.toJSON(),
        measurement.firstByteAt.toJSON()
      )
      assert.strictEqual(
        measurementRow.end_at.toJSON(),
        measurement.endAt.toJSON()
      )
      assert.strictEqual(measurementRow.byte_length, measurement.byteLength)
      assert.strictEqual(measurementRow.attestation, measurement.attestation)
      assert.strictEqual(measurementRow.cid, measurement.cid)
      assert.strictEqual(measurementRow.provider_address, measurement.providerAddress)
      assert.strictEqual(measurementRow.protocol, measurement.protocol)
      assert.strictEqual(measurementRow.spark_version, '1.2.3')
      assert.strictEqual(measurementRow.zinnia_version, '2.3.4')
      assert.strictEqual(measurementRow.completed_at_round, currentSparkRoundNumber.toString())
      assert.strictEqual(measurementRow.published_as, null)
    })

    it('allows older format with walletAddress', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        // THIS IS IMPORTANT
        walletAddress: participantAddress,
        // Everything else does not matter
        cid: 'bafytest',
        providerAddress: '/dns4/localhost/tcp/8080',
        protocol: 'graphsync',
        sparkVersion: '1.2.3',
        zinniaVersion: '2.3.4',
        success: true,
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100,
        attestation: 'json.sig'
      }

      const createRequest = await fetch(`${spark}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement)
      })
      await assertResponseStatus(createRequest, 200)
      const { id } = await createRequest.json()

      const { rows: [measurementRow] } = await client.query(`
          SELECT *
          FROM measurements
          WHERE id = $1
        `, [
        id
      ])
      assert.strictEqual(measurementRow.participant_address, participantAddress)
    })
  })

  describe('GET /measurements/:id', () => {
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
        participantAddress,
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100,
        attestation: 'json.sig'
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
      const { measurementId } = await updateRequest.json()
      const res = await fetch(`${spark}/measurements/${measurementId}`)
      await assertResponseStatus(res, 200)
      const body = await res.json()
      assert.strictEqual(body.id, measurementId)
      assert.strictEqual(body.cid, cid)
      assert.strictEqual(body.providerAddress, providerAddress)
      assert.strictEqual(body.protocol, protocol)
      assert.strictEqual(body.sparkVersion, '1.2.3')
      assert.strictEqual(body.zinniaVersion, '2.3.4')
      assert(body.finishedAt)
      assert.strictEqual(body.success, retrieval.success)
      assert.strictEqual(body.startAt, retrieval.startAt.toJSON())
      assert.strictEqual(body.statusCode, retrieval.statusCode)
      assert.strictEqual(body.firstByteAt, retrieval.firstByteAt.toJSON())
      assert.strictEqual(body.endAt, retrieval.endAt.toJSON())
      assert.strictEqual(body.byteLength, retrieval.byteLength)
      assert.strictEqual(body.attestation, retrieval.attestation)
      assert.strictEqual(body.publishedAs, null)
    })
  })

  describe('GET /rounds/current', () => {
    it('returns all properties of the current round', async () => {
      const res = await fetch(`${spark}/rounds/current`)
      await assertResponseStatus(res, 200)
      const body = await res.json()

      assert.deepStrictEqual(Object.keys(body), [
        'roundId',
        'retrievalTasks'
      ])
      assert.strictEqual(body.roundId, currentSparkRoundNumber.toString())

      for (const t of body.retrievalTasks) {
        assert.strictEqual(typeof t.cid, 'string')
        assert.strictEqual(typeof t.providerAddress, 'string')
        assert.strictEqual(typeof t.protocol, 'string')
      }
    })
  })

  describe('GET /rounds/:id', () => {
    it('returns 404 when the round does not exist', async () => {
      const res = await fetch(`${spark}/rounds/${currentSparkRoundNumber * 2n}`)
      await assertResponseStatus(res, 404)
    })

    it('returns 400 when the round is not a number', async () => {
      const res = await fetch(`${spark}/rounds/not-a-number`)
      await assertResponseStatus(res, 400)
    })

    it('returns all properties of the specified round', async () => {
      const res = await fetch(`${spark}/rounds/${currentSparkRoundNumber}`)
      await assertResponseStatus(res, 200)
      const body = await res.json()

      assert.deepStrictEqual(Object.keys(body), [
        'roundId',
        'retrievalTasks'
      ])
      assert.strictEqual(body.roundId, currentSparkRoundNumber.toString())
    })
  })

  async function givenRetrieval (props = {}) {
    const createRequest = await fetch(
      `${spark}/retrievals`,
      {
        method: 'POST',
        body: JSON.stringify({ sparkVersion, ...props })
      }
    )
    const retrieval = await createRequest.json()
    return retrieval
  }
})
