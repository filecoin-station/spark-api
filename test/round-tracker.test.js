import assert from 'node:assert'
import pg from 'pg'
import { mapCurrentMeridianRoundToSparkRound } from '../lib/round-tracker.js'
import { migrate } from '../lib/migrate.js'

const { DATABASE_URL } = process.env

describe('Round Tracker', () => {
  let pgClient

  before(async () => {
    pgClient = new pg.Client({ connectionString: DATABASE_URL })
    await pgClient.connect()
    await migrate(pgClient)
  })

  after(async () => {
    await pgClient.end()
  })

  beforeEach(async () => {
    await pgClient.query('DELETE FROM meridian_rounds')
  })

  describe('mapCurrentMeridianRoundToSparkRound', () => {
    it('handles meridian rounds from the same contract', async () => {
      let sparkRound = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1a',
        meridianRound: 120n,
        pgClient
      })
      assert.strictEqual(sparkRound, 1n)

      sparkRound = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1a',
        meridianRound: 121n,
        pgClient
      })
      assert.strictEqual(sparkRound, 2n)
    })

    it('handles deployment of a new smart contract', async () => {
      // First contract version `0x1a`
      let sparkRound = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1a',
        meridianRound: 120n,
        pgClient
      })
      assert.strictEqual(sparkRound, 1n)

      // New contract version `0x1b`
      sparkRound = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1b',
        meridianRound: 10n,
        pgClient
      })
      assert.strictEqual(sparkRound, 2n)

      // Double check that the next meridian round will map correctly
      // New contract version `0x1b`
      sparkRound = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1b',
        meridianRound: 11n,
        pgClient
      })
      assert.strictEqual(sparkRound, 3n)
    })
  })
})