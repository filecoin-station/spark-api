import { publish } from '../index.js'
import assert from 'node:assert'
import { CID } from 'multiformats/cid'
import pg from 'pg'

const { DATABASE_URL } = process.env

describe('unit', () => {
  it('publishes', async () => {
    const cid = 'bafybeicmyzlxgqeg5lgjgnzducj37s7bxhxk6vywqtuym2vhqzxjtymqvm'

    const client = {
      async query (_, params) {
        assert.strictEqual(params[0], 1)

        client.query = (_, params) => {
          assert.strictEqual(params[0], cid)
          assert.deepStrictEqual(params[1], [])
        }

        return { rows: [] }
      }
    }

    const web3Storage = {
      async put (files) {
        assert.strictEqual(files.length, 1)
        return CID.parse(cid)
      }
    }

    const ieContract = {
      async addMeasurements (_cid) {
        assert.strictEqual(_cid, cid)
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

    const web3Storage = {
      async put (files) {
        assert.strictEqual(files.length, 1)
        return CID.parse(cid)
      }
    }

    const ieContract = {
      async addMeasurements (_cid) {
        assert.strictEqual(_cid, cid)
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
  })
})
