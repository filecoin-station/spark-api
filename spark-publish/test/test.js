import { publish } from '../index.js'
import assert from 'node:assert'
import { CID } from 'multiformats/cid'
import pg from 'pg'
import * as telemetry from '../lib/telemetry.js'

import { assertApproximately } from '../../test/test-helpers.js'

const { DATABASE_URL } = process.env

after(telemetry.close)

describe('unit', () => {
  it('publishes', async () => {
    const cid = 'bafybeicmyzlxgqeg5lgjgnzducj37s7bxhxk6vywqtuym2vhqzxjtymqvm'

    const clientStatements = []
    const clientQueryParams = []
    const client = {
      connect () {
        return client
      },
      release () {},
      async query (statement, params) {
        clientStatements.push(statement)
        if (statement.includes('SELECT COUNT(*) FROM measurements')) {
          return { rows: [{ count: 10 }] }
        }
        if (statement.includes('INSERT INTO commitments')) {
          return { rows: [] }
        }
        if (statement.startsWith('VACUUM')) {
          return { rows: [] }
        }

        clientQueryParams.push(params)
        return { rows: [] }
      }
    }

    const web3StorageUploadFiles = []
    const web3Storage = {
      async uploadFile (file) {
        web3StorageUploadFiles.push(file)
        return CID.parse(cid)
      }
    }

    const ieContractMeasurementCIDs = []
    const ieContract = {
      async addMeasurements (_cid) {
        ieContractMeasurementCIDs.push(_cid)
        return {
          async wait () {
            return {
              logs: []
            }
          }
        }
      },
      interface: {
        parseLog () {
          return {
            args: [
              null,
              1
            ]
          }
        }
      }
    }

    const logger = { log () {} }

    await publish({
      client,
      web3Storage,
      ieContract,
      maxMeasurements: 1,
      logger
    })

    assert.deepStrictEqual(clientQueryParams, [
      [1],
      undefined,
      [[]],
      undefined
    ])
    assert.strictEqual(clientStatements.pop(), 'VACUUM measurements')
    assert.strictEqual(web3StorageUploadFiles.length, 1)
    assert.deepStrictEqual(ieContractMeasurementCIDs, [cid])
  })
})

describe('integration', () => {
  let client

  before(async () => {
    client = new pg.Pool({ connectionString: DATABASE_URL })
  })

  after(async () => {
    await client.end()
  })

  it('publishes', async () => {
    await client.query('DELETE FROM commitments')
    await client.query('DELETE FROM measurements')

    const measurements = [{
      sparkVersion: '1.2.3',
      zinniaVersion: '0.5.6',
      cid: 'bafytest',
      providerAddress: '/dns4/localhost/tcp/8080',
      protocol: 'graphsync',
      participantAddress: 't1foobar',
      timeout: false,
      startAt: new Date('2023-09-18T13:33:51.239Z'),
      statusCode: 200,
      firstByteAt: new Date('2023-09-18T13:33:51.239Z'),
      endAt: null,
      byteLength: 100,
      attestation: 'json.sig',
      inetGroup: 'MTIzNDU2Nzg',
      carTooLarge: true,
      carChecksum: 'somehash',
      indexerResult: 'ERROR_404',
      round: 42
    }, {
      sparkVersion: '1.2.3',
      zinniaVersion: '0.5.6',
      cid: 'bafytest',
      providerAddress: '/dns4/localhost/tcp/8080',
      protocol: 'graphsync',
      participantAddress: 't1foobar',
      timeout: false,
      startAt: new Date('2023-09-18T13:33:51.239Z'),
      statusCode: 200,
      firstByteAt: new Date('2023-09-18T13:33:51.239Z'),
      endAt: null,
      byteLength: 100,
      attestation: 'json.sig',
      inetGroup: 'MTIzNDU2Nzg',
      carTooLarge: true,
      round: 42
    }]

    for (const measurement of measurements) {
      await insertMeasurement(client, measurement)
    }

    const cid = 'bafybeicmyzlxgqeg5lgjgnzducj37s7bxhxk6vywqtuym2vhqzxjtymqvm'

    // We're not sure if we're going to stick with web3.storage, or switch to
    // helia or another tool. Therefore, we're going to use a mock here.
    const web3StorageUploadFiles = []
    const web3Storage = {
      async uploadFile (file) {
        web3StorageUploadFiles.push(file)
        return CID.parse(cid)
      }
    }

    const nextMeasurement = {
      ...(measurements[0]),
      cid: 'bafynew'
    }

    // TODO: Figure out how to use anvil here
    const ieContractMeasurementCIDs = []
    const ieContract = {
      async addMeasurements (_cid) {
        ieContractMeasurementCIDs.push(_cid)
        // In real world, calling the IE contract takes ~3 minutes. In the meantime, more
        // measurements are recorded. We need to test that these measurements are not deleted.
        await insertMeasurement(client, nextMeasurement)
        return {
          async wait () {
            return {
              logs: []
            }
          }
        }
      },
      interface: {
        parseLog () {
          return {
            args: [
              null,
              1
            ]
          }
        }
      }
    }

    const logger = {
      log () {},
      error (...args) {
        console.error(...args)
      }
    }

    await publish({
      client,
      web3Storage,
      ieContract,
      maxMeasurements: 2,
      logger
    })

    // TODO: Check data has been committed to the contract

    assert.strictEqual(web3StorageUploadFiles.length, 1)
    assert.deepStrictEqual(ieContractMeasurementCIDs, [cid])

    const payload = (await web3StorageUploadFiles[0].text())
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
    assert.strictEqual(payload.length, 2)
    const published = payload[0]
    const measurementRecorded = measurements[0]
    assert.strictEqual(published.spark_version, measurementRecorded.sparkVersion)
    assert.strictEqual(published.cid, measurementRecorded.cid)
    assert.strictEqual(published.inet_group, measurementRecorded.inetGroup)
    assert.strictEqual(published.car_too_large, measurementRecorded.carTooLarge)
    assert.strictEqual(published.end_at, null)
    assert.strictEqual(published.car_checksum, measurementRecorded.carChecksum)
    assert.strictEqual(published.indexer_result, measurementRecorded.indexerResult)
    // TODO: test other fields

    // We are publishing records with invalid wallet addresses too
    assert.strictEqual(published.participant_address, 't1foobar')

    const { rows: commitments } = await client.query('SELECT * FROM commitments')
    assert.deepStrictEqual(commitments.map(c => c.cid), [cid])
    assertApproximately(commitments[0].published_at, new Date(), 1_000 /* milliseconds */)

    // Check that published measurements were deleted and measurements added later were preserved
    const { rows: remainingMeasurements } = await client.query('SELECT cid FROM measurements')
    assert.deepStrictEqual(remainingMeasurements.map(r => r.cid), ['bafynew'])
  })
})

const insertMeasurement = async (client, measurement) => {
  await client.query(`
  INSERT INTO measurements (
    spark_version,
    zinnia_version,
    cid,
    provider_address,
    protocol,
    participant_address,
    timeout,
    start_at,
    status_code,
    first_byte_at,
    end_at,
    byte_length,
    attestation,
    inet_group,
    car_too_large,
    car_checksum,
    indexer_result,
    completed_at_round
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
  )
`, [
    measurement.sparkVersion,
    measurement.zinniaVersion,
    measurement.cid,
    measurement.providerAddress,
    measurement.protocol,
    measurement.participantAddress,
    measurement.timeout,
    measurement.startAt,
    measurement.statusCode,
    measurement.firstByteAt,
    measurement.endAt,
    measurement.byteLength,
    measurement.attestation,
    measurement.inetGroup,
    measurement.carTooLarge,
    measurement.carChecksum,
    measurement.indexerResult,
    measurement.round
  ])
}
