import { publish } from '../index.js'
import assert from 'node:assert'
import { CID } from 'multiformats/cid'
import pg from 'pg'

const { DATABASE_URL } = process.env

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
  })
})
