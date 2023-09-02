import { publish } from '../index.js'
import assert from 'node:assert'
import { CID } from 'multiformats/cid'

describe('publish', () => {
  it('publishes', async () => {
    const client = {
      async query (_, params) {
        assert.strictEqual(params[0], 1)

        client.query = (_, params) => {
          assert.strictEqual(
            params[0].toString(),
            'bafybeicmyzlxgqeg5lgjgnzducj37s7bxhxk6vywqtuym2vhqzxjtymqvm'
          )
          assert.deepStrictEqual(params[1], [])
        }

        return { rows: [] }
      }
    }

    const web3Storage = {
      async put (files) {
        assert.strictEqual(files.length, 1)
        return CID.parse(
          'bafybeicmyzlxgqeg5lgjgnzducj37s7bxhxk6vywqtuym2vhqzxjtymqvm'
        )
      }
    }

    const ieContract = {
      async addMeasurements (cid) {
        assert.strictEqual(
          cid,
          'bafybeicmyzlxgqeg5lgjgnzducj37s7bxhxk6vywqtuym2vhqzxjtymqvm'
        )
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

    await publish({
      client,
      web3Storage,
      ieContract,
      maxMeasurements: 1
    })
  })
})
