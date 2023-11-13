import { createHandler } from '../index.js'
import http from 'node:http'
import { once } from 'node:events'
import assert, { AssertionError } from 'node:assert'
import pg from 'pg'
import { maybeCreateSparkRound, mapCurrentMeridianRoundToSparkRound } from '../lib/round-tracker.js'

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
      },
      domain: '127.0.0.1'
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
    it('returns 410 OUTDATED CLIENT', async () => {
      const res = await fetch(`${spark}/retrievals`, { method: 'POST', body: JSON.stringify({ sparkVersion }) })
      await assertResponseStatus(res, 410)
      const body = await res.text()
      assert.strictEqual(body, 'OUTDATED CLIENT')
    })
  })
  describe('PATCH /retrievals/:id', () => {
    // This API endpoint is used by old clients which always send walletAddress
    const walletAddress = participantAddress

    it('returns 410 OUTDATED CLIENT', async () => {
      const result = {
        walletAddress,
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100,
        attestation: 'json.sig'
      }

      const updateRequest = await fetch(
        `${spark}/retrievals/1`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        }
      )

      await assertResponseStatus(updateRequest, 410)
      const body = await updateRequest.text()
      assert.strictEqual(body, 'OUTDATED CLIENT')
    })
  })
  describe('GET /retrievals/:id', () => {
    it('returns error', async () => {
      const res = await fetch(`${spark}/retrievals/0`)
      await assertResponseStatus(res, 410 /* Gone */)
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
        participantAddress,
        startAt: new Date(),
        statusCode: 200,
        firstByteAt: new Date(),
        endAt: new Date(),
        byteLength: 100,
        carTooLarge: true,
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
      assert.match(measurementRow.inet_group, /^.{12}$/)
      assert.strictEqual(measurementRow.car_too_large, true)
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
      const retrieval = {
        cid: 'bafytest',
        providerAddress: '/dns4/localhost/tcp/8080',
        protocol: 'graphsync',
        sparkVersion: '1.2.3',
        zinniaVersion: '2.3.4',
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
        body: JSON.stringify(retrieval)
      })
      await assertResponseStatus(createRequest, 200)
      const { id: measurementId } = await createRequest.json()

      const res = await fetch(`${spark}/measurements/${measurementId}`)
      await assertResponseStatus(res, 200)
      const body = await res.json()
      assert.strictEqual(body.id, measurementId)
      assert.strictEqual(body.cid, retrieval.cid)
      assert.strictEqual(body.providerAddress, retrieval.providerAddress)
      assert.strictEqual(body.protocol, retrieval.protocol)
      assert.strictEqual(body.sparkVersion, '1.2.3')
      assert.strictEqual(body.zinniaVersion, '2.3.4')
      assert(body.finishedAt)
      assert.strictEqual(body.startAt, retrieval.startAt.toJSON())
      assert.strictEqual(body.statusCode, retrieval.statusCode)
      assert.strictEqual(body.firstByteAt, retrieval.firstByteAt.toJSON())
      assert.strictEqual(body.endAt, retrieval.endAt.toJSON())
      assert.strictEqual(body.byteLength, retrieval.byteLength)
      assert.strictEqual(body.attestation, retrieval.attestation)
      assert.strictEqual(body.publishedAs, null)
      assert.strictEqual(body.carTooLarge, false)
    })
  })

  describe('GET /round/meridian/:address/:round', () => {
    before(async () => {
      await client.query('DELETE FROM meridian_contract_versions')

      // round 1 managed by old contract version
      let num = await mapCurrentMeridianRoundToSparkRound({
        pgClient: client,
        meridianContractAddress: '0xOLD',
        meridianRoundIndex: 10n
      })
      assert.strictEqual(num, 1n)

      // round 2 managed by the new contract version
      num = await mapCurrentMeridianRoundToSparkRound({
        pgClient: client,
        meridianContractAddress: '0xNEW',
        meridianRoundIndex: 120n
      })
      assert.strictEqual(num, 2n)

      // round 3 managed by the new contract version too
      num = await mapCurrentMeridianRoundToSparkRound({
        pgClient: client,
        meridianContractAddress: '0xNEW',
        meridianRoundIndex: 121n
      })
      assert.strictEqual(num, 3n)
    })

    it('returns details of the correct SPARK round', async () => {
      const res = await fetch(`${spark}/rounds/meridian/0xNEW/120`)
      await assertResponseStatus(res, 200)
      const { retrievalTasks, ...details } = await res.json()

      assert.deepStrictEqual(details, {
        roundId: '2'
      })
      assert.strictEqual(retrievalTasks.length, 200)
    })

    it('returns details of a SPARK round managed by older contract version', async () => {
      const res = await fetch(`${spark}/rounds/meridian/0xOLD/10`)
      await assertResponseStatus(res, 200)
      const { retrievalTasks, ...details } = await res.json()

      assert.deepStrictEqual(details, {
        roundId: '1'
      })
      assert.strictEqual(retrievalTasks.length, 400)
    })

    it('returns 404 for unknown round index', async () => {
      const res = await fetch(`${spark}/rounds/meridian/0xNEW/99`)
      await assertResponseStatus(res, 404)
    })

    it('returns 404 for unknown contract address', async () => {
      const res = await fetch(`${spark}/rounds/meridian/0xaa/120`)
      await assertResponseStatus(res, 404)
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

  describe('Redirect', () => {
    it('redirects to the right domain', async () => {
      let server
      try {
        const handler = await createHandler({
          client,
          logger: {
            info () {},
            error (...args) { console.error(...args) }
          },
          async getCurrentRound () {
            return currentSparkRoundNumber
          },
          domain: 'foobar'
        })
        server = http.createServer(handler)
        server.listen()
        await once(server, 'listening')
        const spark = `http://127.0.0.1:${server.address().port}`
        const res = await fetch(
          `${spark}/rounds/${currentSparkRoundNumber}`,
          { redirect: 'manual' }
        )
        await assertResponseStatus(res, 301)
        assert.strictEqual(res.headers.get('location'), `https://foobar/rounds/${currentSparkRoundNumber}`)
      } finally {
        server.closeAllConnections()
        server.close()
      }
    })
  })
})
