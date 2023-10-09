import { publish } from '../index.js'
import assert from 'node:assert'
import { CID } from 'multiformats/cid'
import pg from 'pg'
import * as telemetry from '../lib/telemetry.js'

const { DATABASE_URL } = process.env

after(telemetry.close)

describe('unit', () => {
  it('publishes', async () => {
    const cid = 'bafybeicmyzlxgqeg5lgjgnzducj37s7bxhxk6vywqtuym2vhqzxjtymqvm'

    const clientQueryParams = []
    const client = {
      async query (_, params) {
        clientQueryParams.push(params)
        return { rows: [] }
      }
    }

    const web3StoragePutFiles = []
    const web3Storage = {
      async put (files) {
        web3StoragePutFiles.push(files)
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
              events: [
                {
                  event: 'MeasurementsAdded',
                  args: {
                    roundIndex: 1
                  }
                }
              ]
            }
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
      [cid, []]
    ])
    assert.strictEqual(web3StoragePutFiles.length, 1)
    assert.strictEqual(web3StoragePutFiles[0].length, 1)
    assert.deepStrictEqual(ieContractMeasurementCIDs, [cid])
  })
})

describe('integration', () => {
  let client

  before(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
  })

  after(async () => {
    await client.end()
  })

  it('publishes', async () => {
    await client.query('DELETE FROM measurements')

    const measurementRecorded = {
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
      endAt: new Date('2023-09-18T13:33:51.239Z'),
      byteLength: 100,
      attestation: 'json.sig',
      round: 42
    }

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
        completed_at_round
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )
    `, [
      measurementRecorded.sparkVersion,
      measurementRecorded.zinniaVersion,
      measurementRecorded.cid,
      measurementRecorded.providerAddress,
      measurementRecorded.protocol,
      measurementRecorded.participantAddress,
      measurementRecorded.timeout,
      measurementRecorded.startAt,
      measurementRecorded.statusCode,
      measurementRecorded.firstByteAt,
      measurementRecorded.endAt,
      measurementRecorded.byteLength,
      measurementRecorded.attestation,
      measurementRecorded.round
    ])

    const cid = 'bafybeicmyzlxgqeg5lgjgnzducj37s7bxhxk6vywqtuym2vhqzxjtymqvm'

    // We're not sure if we're going to stick with web3.storage, or switch to
    // helia or another tool. Therefore, we're going to use a mock here.
    const web3StoragePutFiles = []
    const web3Storage = {
      async put (files) {
        web3StoragePutFiles.push(files)
        return CID.parse(cid)
      }
    }

    // TODO: Figure out how to use anvil here
    const ieContractMeasurementCIDs = []
    const ieContract = {
      async addMeasurements (_cid) {
        ieContractMeasurementCIDs.push(_cid)
        return {
          async wait () {
            return {
              events: [
                {
                  event: 'MeasurementsAdded',
                  args: {
                    roundIndex: 1
                  }
                }
              ]
            }
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
      maxMeasurements: 1,
      logger
    })

    // TODO: Check data has been committed to the contract

    assert.strictEqual(web3StoragePutFiles.length, 1)
    assert.strictEqual(web3StoragePutFiles[0].length, 1)
    assert.deepStrictEqual(ieContractMeasurementCIDs, [cid])

    const payload = JSON.parse(await web3StoragePutFiles[0][0].text())
    assert.strictEqual(payload.length, 1)
    const published = payload[0]
    assert.strictEqual(published.spark_version, measurementRecorded.sparkVersion)
    assert.strictEqual(published.cid, measurementRecorded.cid)
    // TODO: test other fields

    // We are publishing records with invalid wallet addresses too
    assert.strictEqual(published.participant_address, 't1foobar')
  })
})
