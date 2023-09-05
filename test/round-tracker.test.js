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
    await pgClient.query('DELETE FROM meridian_contract_versions')
    await pgClient.query('DELETE FROM spark_rounds')
  })

  describe('mapCurrentMeridianRoundToSparkRound', () => {
    it('handles meridian rounds from the same contract', async () => {
      let sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1a',
        meridianRoundIndex: 120n,
        pgClient
      })
      assert.strictEqual(sparkRoundNumber, 1n)
      let sparkRounds = (await pgClient.query('SELECT * FROM spark_rounds ORDER BY id')).rows
      assert.deepStrictEqual(sparkRounds.map(r => r.id), ['1'])
      assertApproximately(sparkRounds[0].created_at, new Date(), 30_000)

      sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1a',
        meridianRoundIndex: 121n,
        pgClient
      })
      assert.strictEqual(sparkRoundNumber, 2n)
      sparkRounds = (await pgClient.query('SELECT * FROM spark_rounds ORDER BY id')).rows
      assert.deepStrictEqual(sparkRounds.map(r => r.id), ['1', '2'])
      assertApproximately(sparkRounds[1].created_at, new Date(), 30_000)
    })

    it('handles deployment of a new smart contract', async () => {
      // First contract version `0x1a`
      let sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1a',
        meridianRoundIndex: 120n,
        pgClient
      })
      assert.strictEqual(sparkRoundNumber, 1n)

      // New contract version `0x1b`
      sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1b',
        meridianRoundIndex: 10n,
        pgClient
      })
      assert.strictEqual(sparkRoundNumber, 2n)

      // Double check that the next meridian round will map correctly
      // New contract version `0x1b`
      sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1b',
        meridianRoundIndex: 11n,
        pgClient
      })
      assert.strictEqual(sparkRoundNumber, 3n)
    })

    it('handles duplicate RoundStarted event', async () => {
      const now = new Date()
      const meridianRoundIndex = 1n
      const meridianContractAddress = '0x1a'

      let sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress,
        meridianRoundIndex,
        pgClient
      })
      assert.strictEqual(sparkRoundNumber, 1n)
      let sparkRounds = (await pgClient.query('SELECT * FROM spark_rounds ORDER BY id')).rows
      assert.deepStrictEqual(sparkRounds.map(r => r.id), ['1'])
      assertApproximately(sparkRounds[0].created_at, now, 30_000)

      sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress,
        meridianRoundIndex,
        pgClient
      })
      assert.strictEqual(sparkRoundNumber, 1n)
      sparkRounds = (await pgClient.query('SELECT * FROM spark_rounds ORDER BY id')).rows
      assert.deepStrictEqual(sparkRounds.map(r => r.id), ['1'])
      assertApproximately(sparkRounds[0].created_at, now, 30_000)
    })
  })
})

function assertApproximately (actual, expected, delta) {
  assert(Math.abs(actual - expected) < delta,
    `Expected ${actual} to be approximately ${expected} (+/- ${delta})`)
}
