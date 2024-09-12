import { createHandler } from '../index.js'
import http from 'node:http'
import { once } from 'node:events'
import assert, { AssertionError } from 'node:assert'
import pg from 'pg'
import {
  BASELINE_TASKS_PER_ROUND,
  maybeCreateSparkRound,
  mapCurrentMeridianRoundToSparkRound,
  BASELINE_TASKS_PER_NODE
} from '../lib/round-tracker.js'
import { delegatedFromEthAddress } from '@glif/filecoin-address'
import { createTelemetryRecorderStub } from '../../test-helpers/platform-test-helpers.js'

const { DATABASE_URL } = process.env
const participantAddress = '0x000000000000000000000000000000000000dEaD'
const sparkVersion = '1.13.0' // This must be in sync with the minimum supported client version
const currentSparkRoundNumber = 42n

const VALID_MEASUREMENT = {
  cid: 'bafytest',
  providerAddress: '/dns4/localhost/tcp/8080',
  stationId: '8800000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  protocol: 'graphsync',
  sparkVersion,
  zinniaVersion: '2.3.4',
  participantAddress,
  startAt: new Date(),
  statusCode: 200,
  firstByteAt: new Date(),
  endAt: new Date(),
  byteLength: 100,
  carTooLarge: true,
  attestation: 'json.sig',
  carChecksum: 'somehash',
  minerId: 'f02abc',
  providerId: 'provider-pubkey',
  indexerResult: 'OK'
}

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
    await maybeCreateSparkRound(client, {
      sparkRoundNumber: currentSparkRoundNumber,
      meridianContractAddress: '0x1a',
      meridianRoundIndex: 123n,
      roundStartEpoch: 321n,
      recordTelemetry: createTelemetryRecorderStub().recordTelemetry
    })
    const handler = await createHandler({
      client,
      logger: {
        info () {},
        error: console.error,
        request () {}
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
        ...VALID_MEASUREMENT

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
      assert.strictEqual(measurementRow.spark_version, sparkVersion)
      assert.strictEqual(measurementRow.zinnia_version, '2.3.4')
      assert.strictEqual(measurementRow.completed_at_round, currentSparkRoundNumber.toString())
      assert.match(measurementRow.inet_group, /^.{12}$/)
      assert.strictEqual(measurementRow.car_too_large, true)
      assert.strictEqual(measurementRow.indexer_result, 'OK')
      assert.strictEqual(measurementRow.car_checksum, 'somehash')
      assert.strictEqual(measurementRow.miner_id, measurement.minerId)
      assert.strictEqual(measurementRow.provider_id, measurement.providerId)
      assert.strictEqual(measurementRow.station_id, measurement.stationId)
    })

    it('allows older format with walletAddress', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        ...VALID_MEASUREMENT,
        walletAddress: participantAddress,
        participantAddress: undefined
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

    it('allows f4 addresses', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        ...VALID_MEASUREMENT,
        participantAddress: delegatedFromEthAddress(participantAddress, 'f')
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

    it('validates f4 addresses', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        ...VALID_MEASUREMENT,
        participantAddress: `${delegatedFromEthAddress(participantAddress, 'f')}0`
      }

      const createRequest = await fetch(`${spark}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement)
      })
      await assertResponseStatus(createRequest, 400)
    })

    it('handles date fields set to null', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        ...VALID_MEASUREMENT,
        statusCode: undefined,
        startAt: null,
        firstByteAt: null,
        endAt: null
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

      assert.strictEqual(measurementRow.status_code, null)
      assert.strictEqual(measurementRow.start_at, null)
      assert.strictEqual(measurementRow.first_byte_at, null)
      assert.strictEqual(measurementRow.end_at, null)
    })

    it('rejects spark_version before v1.9.0', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        // THIS IS IMPORTANT
        sparkVersion: '1.8.0',
        // Everything else does not matter
        cid: 'bafytest',
        providerAddress: '/dns4/localhost/tcp/8080',
        protocol: 'graphsync',
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

      const res = await fetch(`${spark}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement)
      })
      await assertResponseStatus(res, 410)
      const body = await res.text()
      assert.strictEqual(body, 'OUTDATED CLIENT')

      const { rows } = await client.query('SELECT id, spark_version FROM measurements')
      assert.deepStrictEqual(rows, [])
    })

    it('allows no provider & protocol', async () => {
      // We don't have the provider & protocol fields for deals that are not advertised to IPNI
      await client.query('DELETE FROM measurements')

      const measurement = {
        ...VALID_MEASUREMENT,
        providerAddress: undefined,
        protocol: undefined
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

      assert.strictEqual(measurementRow.provider_address, null)
      assert.strictEqual(measurementRow.protocol, null)
    })

    it('allows no minerId/providerId', async () => {
      await client.query('DELETE FROM measurements')

      const measurement = {
        ...VALID_MEASUREMENT,
        minerId: undefined,
        providerId: undefined
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

      assert.strictEqual(measurementRow.miner_id, null)
      assert.strictEqual(measurementRow.provider_id, null)
    })

    it('rejects invalid stationId', async () => {
      await client.query('DELETE FROM measurements')
      const measurements = [
        {
          ...VALID_MEASUREMENT,
          stationId: 'this-is-a-malicious-station-id-with-88-chars-long-12345678901234567890123456789012345678'
        },
        {
          ...VALID_MEASUREMENT,
          stationId: '0392c7b3-4b7b-4b7b-8b7b-7b7b7b7b7b7b' // not 88 chars long
        }
      ]

      for (const measurement of measurements) {
        const res = await fetch(`${spark}/measurements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(measurement)
        })
        await assertResponseStatus(res, 400)
        const body = await res.text()
        assert.strictEqual(body, 'Invalid Station ID')
      }

      const { rows } = await client.query('SELECT id FROM measurements')
      assert.deepStrictEqual(rows, [])
    })
  })

  describe('GET /measurements/:id', () => {
    it('gets a completed retrieval', async () => {
      const measurement = { ...VALID_MEASUREMENT }
      const createRequest = await fetch(`${spark}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurement)
      })
      await assertResponseStatus(createRequest, 200)
      const { id: measurementId } = await createRequest.json()

      const res = await fetch(`${spark}/measurements/${measurementId}`)
      await assertResponseStatus(res, 200)
      const body = await res.json()
      assert.strictEqual(body.id, measurementId)
      assert.strictEqual(body.cid, measurement.cid)
      assert.strictEqual(body.minerId, measurement.minerId)
      assert.strictEqual(body.providerId, measurement.providerId)
      assert.strictEqual(body.indexerResult, measurement.indexerResult)
      assert.strictEqual(body.providerAddress, measurement.providerAddress)
      assert.strictEqual(body.protocol, measurement.protocol)
      assert.strictEqual(body.sparkVersion, sparkVersion)
      assert.strictEqual(body.zinniaVersion, '2.3.4')
      assert(body.finishedAt)
      assert.strictEqual(body.startAt, measurement.startAt.toJSON())
      assert.strictEqual(body.statusCode, measurement.statusCode)
      assert.strictEqual(body.firstByteAt, measurement.firstByteAt.toJSON())
      assert.strictEqual(body.endAt, measurement.endAt.toJSON())
      assert.strictEqual(body.byteLength, measurement.byteLength)
      assert.strictEqual(body.attestation, measurement.attestation)
      assert.strictEqual(body.carTooLarge, measurement.carTooLarge)
      assert.strictEqual(body.stationId, measurement.stationId)
    })
  })

  describe('GET /rounds/meridian/:address/:round', () => {
    before(async () => {
      await client.query('DELETE FROM meridian_contract_versions')
      await client.query('DELETE FROM spark_rounds')
      const { recordTelemetry } = createTelemetryRecorderStub()

      // round 1 managed by old contract version
      let num = await mapCurrentMeridianRoundToSparkRound({
        pgClient: client,
        meridianContractAddress: '0xOLD',
        meridianRoundIndex: 10n,
        roundStartEpoch: 321n,
        recordTelemetry
      })
      assert.strictEqual(num, 1n)

      // round 2 managed by the new contract version
      num = await mapCurrentMeridianRoundToSparkRound({
        pgClient: client,
        meridianContractAddress: '0xNEW',
        meridianRoundIndex: 120n,
        roundStartEpoch: 621n,
        recordTelemetry
      })
      assert.strictEqual(num, 2n)

      // round 3 managed by the new contract version too
      num = await mapCurrentMeridianRoundToSparkRound({
        pgClient: client,
        meridianContractAddress: '0xNEW',
        meridianRoundIndex: 121n,
        roundStartEpoch: 921n,
        recordTelemetry
      })
      assert.strictEqual(num, 3n)
    })

    it('returns details of the correct SPARK round', async () => {
      const res = await fetch(`${spark}/rounds/meridian/0xNEW/120`)
      await assertResponseStatus(res, 200)
      const { retrievalTasks, ...details } = await res.json()

      assert.deepStrictEqual(details, {
        roundId: '2',
        maxTasksPerNode: BASELINE_TASKS_PER_NODE,
        startEpoch: '621'
      })
      assert.strictEqual(retrievalTasks.length, BASELINE_TASKS_PER_ROUND)

      for (const task of retrievalTasks) {
        assert.equal(typeof task.cid, 'string', 'all tasks have "cid"')
        assert.equal(typeof task.minerId, 'string', 'all tasks have "minerId"')
        assert(Array.isArray(task.clients), 'all tasks have "clients" array')
        assert(task.clients.length > 0, 'all tasks have at least one item in "clients"')
      }
    })

    it('returns details of a SPARK round managed by older contract version', async () => {
      const res = await fetch(`${spark}/rounds/meridian/0xOLD/10`)
      await assertResponseStatus(res, 200)
      const { retrievalTasks, ...details } = await res.json()

      assert.deepStrictEqual(details, {
        roundId: '1',
        maxTasksPerNode: BASELINE_TASKS_PER_NODE,
        startEpoch: '321'
      })
      assert.strictEqual(retrievalTasks.length, BASELINE_TASKS_PER_ROUND)
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
    before(async () => {
      await client.query('DELETE FROM meridian_contract_versions')
      await client.query('DELETE FROM spark_rounds')
      await maybeCreateSparkRound(client, {
        sparkRoundNumber: currentSparkRoundNumber,
        meridianContractAddress: '0x1a',
        meridianRoundIndex: 123n,
        roundStartEpoch: 321n,
        recordTelemetry: createTelemetryRecorderStub().recordTelemetry
      })
    })

    it('returns temporary redirect with a short max-age', async () => {
      const res = await fetch(`${spark}/rounds/current`, { redirect: 'manual' })
      await assertResponseStatus(res, 302)
      assert.strictEqual(res.headers.get('location'), '/rounds/meridian/0x1a/123')
      assert.strictEqual(res.headers.get('cache-control'), 'max-age=1')
    })

    it('returns all properties of the current round after redirect', async () => {
      const res = await fetch(`${spark}/rounds/current`)
      await assertResponseStatus(res, 200)
      const body = await res.json()

      assert.deepStrictEqual(Object.keys(body), [
        'roundId',
        'startEpoch',
        'maxTasksPerNode',
        'retrievalTasks'
      ])
      assert.strictEqual(body.roundId, currentSparkRoundNumber.toString())
      assert.strictEqual(body.startEpoch, '321')

      for (const t of body.retrievalTasks) {
        assert.strictEqual(typeof t.cid, 'string')
        assert.equal(typeof t.minerId, 'string', 'all tasks have "minerId"')
        assert(Array.isArray(t.clients), 'all tasks have "clients" array')
        assert(t.clients.length > 0, 'all tasks have at least one item in "clients"')
        assert.strictEqual(t.providerAddress, undefined)
        assert.strictEqual(t.protocol, undefined)
      }
    })
  })

  describe('GET /rounds/:id', () => {
    before(async () => {
      await client.query('DELETE FROM meridian_contract_versions')
      await client.query('DELETE FROM spark_rounds')
      await maybeCreateSparkRound(client, {
        sparkRoundNumber: currentSparkRoundNumber,
        meridianContractAddress: '0x1a',
        meridianRoundIndex: 123n,
        roundStartEpoch: 321n,
        recordTelemetry: createTelemetryRecorderStub().recordTelemetry
      })
    })

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
        'maxTasksPerNode',
        'retrievalTasks'
      ])
      assert.strictEqual(body.roundId, currentSparkRoundNumber.toString())
    })
  })

  describe('POST /measurements', () => {
    it('returns a measurement ID above 2^31-1', async () => {
      await client.query(`
        SELECT setval('retrieval_results_id_seq', ${2 ** 31 - 1}, true)
      `)
      const res = await fetch(`${spark}/measurements`, {
        method: 'POST',
        body: JSON.stringify(VALID_MEASUREMENT)
      })
      await assertResponseStatus(res, 200)
      const body = await res.json()

      assert.deepStrictEqual(body, { id: String(2 ** 31) })
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
            error: console.error,
            request () {}
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

  describe('summary of eligible deals', () => {
    before(async () => {
      await client.query(`
        INSERT INTO retrievable_deals (cid, miner_id, client_id, expires_at)
        VALUES
        ('bafyone', 'f0210', 'f0800', '2100-01-01'),
        ('bafyone', 'f0220', 'f0800', '2100-01-01'),
        ('bafytwo', 'f0220', 'f0810', '2100-01-01'),
        ('bafyone', 'f0230', 'f0800', '2100-01-01'),
        ('bafytwo', 'f0230', 'f0800', '2100-01-01'),
        ('bafythree', 'f0230', 'f0810', '2100-01-01'),
        ('bafyfour', 'f0230', 'f0820', '2100-01-01'),
        ('bafyexpired', 'f0230', 'f0800', '2020-01-01')
        ON CONFLICT DO NOTHING
      `)

      await client.query(`
        INSERT INTO allocator_clients (allocator_id, client_id)
        VALUES
        ('f0500', 'f0800'),
        ('f0500', 'f0810'),
        ('f0520', 'f0820')
        ON CONFLICT DO NOTHING
      `)
    })

    describe('GET /miner/{id}/deals/eligible/summary', () => {
      it('returns deal counts grouped by client id', async () => {
        const res = await fetch(`${spark}/miner/f0230/deals/eligible/summary`)
        await assertResponseStatus(res, 200)
        assert.strictEqual(res.headers.get('cache-control'), 'max-age=21600')
        const body = await res.json()
        assert.deepStrictEqual(body, {
          minerId: 'f0230',
          dealCount: 4,
          clients: [
            { clientId: 'f0800', dealCount: 2 },
            { clientId: 'f0810', dealCount: 1 },
            { clientId: 'f0820', dealCount: 1 }
          ]
        })
      })

      it('returns an empty array for miners with no deals in our DB', async () => {
        const res = await fetch(`${spark}/miner/f0000/deals/eligible/summary`)
        await assertResponseStatus(res, 200)
        assert.strictEqual(res.headers.get('cache-control'), 'max-age=21600')
        const body = await res.json()
        assert.deepStrictEqual(body, {
          minerId: 'f0000',
          dealCount: 0,
          clients: []
        })
      })
    })

    describe('GET /client/{id}/deals/eligible/summary', () => {
      it('returns deal counts grouped by miner id', async () => {
        const res = await fetch(`${spark}/client/f0800/deals/eligible/summary`)
        await assertResponseStatus(res, 200)
        assert.strictEqual(res.headers.get('cache-control'), 'max-age=21600')
        const body = await res.json()
        assert.deepStrictEqual(body, {
          clientId: 'f0800',
          dealCount: 4,
          providers: [
            { minerId: 'f0230', dealCount: 2 },
            { minerId: 'f0210', dealCount: 1 },
            { minerId: 'f0220', dealCount: 1 }
          ]
        })
      })

      it('returns an empty array for miners with no deals in our DB', async () => {
        const res = await fetch(`${spark}/client/f0000/deals/eligible/summary`)
        await assertResponseStatus(res, 200)
        assert.strictEqual(res.headers.get('cache-control'), 'max-age=21600')
        const body = await res.json()
        assert.deepStrictEqual(body, {
          clientId: 'f0000',
          dealCount: 0,
          providers: []
        })
      })
    })

    describe('GET /allocator/{id}/deals/eligible/summary', () => {
      it('returns deal counts grouped by client id', async () => {
        const res = await fetch(`${spark}/allocator/f0500/deals/eligible/summary`)
        await assertResponseStatus(res, 200)
        assert.strictEqual(res.headers.get('cache-control'), 'max-age=21600')
        const body = await res.json()
        assert.deepStrictEqual(body, {
          allocatorId: 'f0500',
          dealCount: 6,
          clients: [
            { clientId: 'f0800', dealCount: 4 },
            { clientId: 'f0810', dealCount: 2 }
          ]
        })
      })

      it('returns an empty array for miners with no deals in our DB', async () => {
        const res = await fetch(`${spark}/allocator/f0000/deals/eligible/summary`)
        await assertResponseStatus(res, 200)
        assert.strictEqual(res.headers.get('cache-control'), 'max-age=21600')
        const body = await res.json()
        assert.deepStrictEqual(body, {
          allocatorId: 'f0000',
          dealCount: 0,
          clients: []
        })
      })
    })
  })
})
