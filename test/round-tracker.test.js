import assert from 'node:assert'
import pg from 'pg'
import { TASKS_PER_ROUND, mapCurrentMeridianRoundToSparkRound } from '../lib/round-tracker.js'
import { migrate } from '../lib/migrate.js'
import { assertApproximately } from './test-helpers.js'

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
    await pgClient.query('DELETE FROM retrieval_tasks')
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
      assert.strictEqual(sparkRounds[0].meridian_address, '0x1a')
      assert.strictEqual(sparkRounds[0].meridian_round, '120')

      // first round number was correctly initialised
      assert.strictEqual(await getFirstRoundForContractAddress(pgClient, '0x1a'), '1')

      sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1a',
        meridianRoundIndex: 121n,
        pgClient
      })
      assert.strictEqual(sparkRoundNumber, 2n)
      sparkRounds = (await pgClient.query('SELECT * FROM spark_rounds ORDER BY id')).rows
      assert.deepStrictEqual(sparkRounds.map(r => r.id), ['1', '2'])
      assertApproximately(sparkRounds[1].created_at, new Date(), 30_000)
      assert.strictEqual(sparkRounds[1].meridian_address, '0x1a')
      assert.strictEqual(sparkRounds[1].meridian_round, '121')

      // first round number was not changed
      assert.strictEqual(await getFirstRoundForContractAddress(pgClient, '0x1a'), '1')
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

      // first round number was correctly initialised
      assert.strictEqual(await getFirstRoundForContractAddress(pgClient, '0x1b'), '2')

      const { rows: [round2] } = await pgClient.query('SELECT * FROM spark_rounds WHERE id = 2')
      assert.strictEqual(round2.meridian_address, '0x1b')
      assert.strictEqual(round2.meridian_round, '10')

      // Double check that the next meridian round will map correctly
      // New contract version `0x1b`
      sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1b',
        meridianRoundIndex: 11n,
        pgClient
      })
      assert.strictEqual(sparkRoundNumber, 3n)

      const { rows: [round3] } = await pgClient.query('SELECT * FROM spark_rounds WHERE id = 3')
      assert.strictEqual(round3.meridian_address, '0x1b')
      assert.strictEqual(round3.meridian_round, '11')

      // first round number was not changed
      assert.strictEqual(await getFirstRoundForContractAddress(pgClient, '0x1b'), '2')
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
      assert.strictEqual(sparkRounds[0].meridian_address, '0x1a')
      assert.strictEqual(sparkRounds[0].meridian_round, '1')

      sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress,
        meridianRoundIndex,
        pgClient
      })
      assert.strictEqual(sparkRoundNumber, 1n)
      sparkRounds = (await pgClient.query('SELECT * FROM spark_rounds ORDER BY id')).rows
      assert.deepStrictEqual(sparkRounds.map(r => r.id), ['1'])
      assertApproximately(sparkRounds[0].created_at, now, 30_000)
      assert.strictEqual(sparkRounds[0].meridian_address, '0x1a')
      assert.strictEqual(sparkRounds[0].meridian_round, '1')
    })

    it('creates tasks when a new round starts', async () => {
      const sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress: '0x1a',
        meridianRoundIndex: 1n,
        pgClient
      })

      const { rows: tasks } = await pgClient.query('SELECT * FROM retrieval_tasks ORDER BY id')
      assert.strictEqual(tasks.length, TASKS_PER_ROUND)
      for (const [ix, t] of tasks.entries()) {
        assert.strictEqual(BigInt(t.round_id), sparkRoundNumber)
        assert.strictEqual(typeof t.cid, 'string', `task#${ix} cid`)
        assert.strictEqual(typeof t.provider_address, 'string', `task#${ix} providerAddress`)
        assert.strictEqual(typeof t.protocol, 'string', `task#${ix} protocol`)
      }
    })

    it('creates tasks only once per round', async () => {
      const meridianRoundIndex = 1n
      const meridianContractAddress = '0x1a'
      const firstRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress,
        meridianRoundIndex,
        pgClient
      })
      const secondRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress,
        meridianRoundIndex,
        pgClient
      })
      assert.strictEqual(firstRoundNumber, secondRoundNumber)

      const { rows: tasks } = await pgClient.query('SELECT * FROM retrieval_tasks ORDER BY id')
      assert.strictEqual(tasks.length, TASKS_PER_ROUND)
      for (const t of tasks) {
        assert.strictEqual(BigInt(t.round_id), firstRoundNumber)
      }
    })
  })
})

const getFirstRoundForContractAddress = async (pgClient, contractAddress) => {
  const { rows } = await pgClient.query(
    'SELECT first_spark_round_number FROM meridian_contract_versions WHERE contract_address = $1',
    [contractAddress]
  )
  return rows?.[0]?.first_spark_round_number
}
