import Sentry from '@sentry/node'
import { createMeridianContract } from './ie-contract.js'

// The number of tasks per round is proportionate to the SPARK round length - longer rounds require
// more tasks per round.
//
// See https://www.notion.so/pl-strflt/SPARK-tasking-v2-604e26d57f6b4892946525bcb3a77104?pvs=4#ded1cd98c2664a2289453d38e2715643
// for more details, this constant represents TC (tasks per committee).
//
// We will need to tweak this value based on measurements; that's why I put it here as a constant.
export const TASKS_PER_ROUND = 1000

// How many tasks is each SPARK checker node expected to complete every round (at most).
export const MAX_TASKS_PER_NODE = 15

/**
 * @param {import('pg').Pool} pgPool
 * @returns {() => {
 *  sparkRoundNumber: bigint;
 *  meridianContractAddress: string;
 *  meridianRoundIndex: bigint;
 * }}
 */
export async function createRoundGetter (pgPool) {
  const contract = await createMeridianContract()

  let sparkRoundNumber, meridianContractAddress, meridianRoundIndex

  const updateSparkRound = async (newRoundIndex) => {
    meridianRoundIndex = BigInt(newRoundIndex)
    meridianContractAddress = contract.address

    const pgClient = await pgPool.connect()
    try {
      await pgClient.query('BEGIN')
      sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
        meridianContractAddress,
        meridianRoundIndex,
        pgClient
      })
      await pgClient.query('COMMIT')
      console.log('SPARK round started: %s', sparkRoundNumber)
    } catch (err) {
      await pgClient.query('ROLLBACK')
    } finally {
      pgClient.release()
    }
  }

  contract.on('RoundStart', (newRoundIndex) => {
    updateSparkRound(newRoundIndex).catch(err => {
      console.error('Cannot handle RoundStart:', err)
      Sentry.captureException(err)
    })
  })

  await updateSparkRound(await contract.currentRoundIndex())

  return () => ({
    sparkRoundNumber,
    meridianContractAddress,
    meridianRoundIndex
  })
}

/*
There are three cases we need to handle:

1. Business as usual - the IE contract advanced the round by one
2. Fresh start, e.g. a new spark-api instance is deployed, or we deploy this PR to an existing instance.
3. Upgrade of the IE contract

For each IE version (defined as the smart contract address), we are keeping track of three fields:
- `contractAddress`
- `sparkRoundOffset`
- `lastSparkRoundNumber`

Whenever a new IE round is started, we know the current IE round number (`meridianRoundIndex`)

Let me explain how are the different cases handled.

**Business as usual**

We want to map IE round number to SPARK round number. This assumes we have already initialised our
DB for the current IE contract version we are working with.

```
sparkRoundNumber = meridianRoundIndex + sparkRoundOffset
```

For example, if we observe IE round 123, then `sparkRoundOffset` is `-122` and we calculate the
spark round as `123 + (-122) = 1`.

We update the record for the current IE contract address
to set `last_spark_round_number = sparkRoundNumber`.

**Fresh start**

There is no record in our DB. We want to map the current IE round number to SPARK round 1. Also, we
want to setup `sparkRoundOffset` so that the algorithm above produces correct SPARK round numbers.

```
sparkRoundNumber = 1
sparkRoundOffset = sparkRoundNumber - meridianRoundIndex
```

We insert a new record to our DB with the address of the current IE contract, `sparkRoundOffset`,
and `last_spark_round_number = sparkRoundNumber`.

**Upgrading IE contract**

We have one or more existing records in our DB. We know what is the last SPARK round that we
calculated from the previous version of the IE contract (`lastSparkRoundNumber`). We also know what
is the round number of the new IE contract.

```
sparkRoundNumber = lastSparkRoundNumber + 1
sparkRoundOffset = sparkRoundNumber - meridianRoundIndex
```

We insert a new record to our DB with the address of the current IE contract, `sparkRoundOffset`,
and `last_spark_round_number = sparkRoundNumber`.

If you are wondering how to find out what is the last SPARK round that we calculated from the
previous version of the IE contract - we can easily find it in our DB:

```sql
SELECT last_spark_round_number
FROM meridian_contract_versions
ORDER BY last_spark_round_number DESC
LIMIT 1
```
*/

export async function mapCurrentMeridianRoundToSparkRound ({
  meridianContractAddress,
  meridianRoundIndex,
  pgClient
}) {
  let sparkRoundNumber

  const { rows: [contractVersionOfPreviousSparkRound] } = await pgClient.query(
    'SELECT * FROM meridian_contract_versions ORDER BY last_spark_round_number DESC LIMIT 1'
  )

  // More events coming from the same meridian contract
  if (contractVersionOfPreviousSparkRound?.contract_address === meridianContractAddress) {
    sparkRoundNumber = BigInt(contractVersionOfPreviousSparkRound.spark_round_offset) + meridianRoundIndex
    await pgClient.query(
      'UPDATE meridian_contract_versions SET last_spark_round_number = $1 WHERE contract_address = $2',
      [sparkRoundNumber, meridianContractAddress]
    )
    console.log('Mapped %s IE round index %s to SPARK round number %s',
      meridianContractAddress,
      meridianRoundIndex,
      sparkRoundNumber
    )
  } else {
    // We are running for the first time and need to map the meridian round to spark round 1
    // Or the contract address has changed
    const lastSparkRoundNumber = BigInt(contractVersionOfPreviousSparkRound?.last_spark_round_number ?? 0)
    sparkRoundNumber = lastSparkRoundNumber + 1n
    const sparkRoundOffset = sparkRoundNumber - meridianRoundIndex

    // TODO(bajtos) If we are were are reverting back to a contract address (version) we were
    // using sometime in the past, the query above will fail. We can fix the problem and support
    // this edge case by telling Postgres to ignore conflicts (`ON CONFLICT DO NOTHING)`
    await pgClient.query(`
      INSERT INTO meridian_contract_versions
      (contract_address, spark_round_offset, last_spark_round_number, first_spark_round_number)
      VALUES ($1, $2, $3, $3)
    `, [
      meridianContractAddress,
      sparkRoundOffset,
      sparkRoundNumber
    ])
    console.log(
      'Upgraded meridian contract from %s to %s, mapping IE round index %s to SPARK round number %s',
      contractVersionOfPreviousSparkRound?.contract_address ?? '<n/a>',
      meridianContractAddress,
      meridianRoundIndex,
      sparkRoundNumber
    )
  }

  await maybeCreateSparkRound(pgClient, { sparkRoundNumber, meridianContractAddress, meridianRoundIndex })

  return sparkRoundNumber
}

export async function maybeCreateSparkRound (pgClient, {
  sparkRoundNumber,
  meridianContractAddress,
  meridianRoundIndex
}) {
  const { rowCount } = await pgClient.query(`
    INSERT INTO spark_rounds
    (id, created_at, meridian_address, meridian_round, max_tasks_per_node)
    VALUES ($1, now(), $2, $3, $4)
    ON CONFLICT DO NOTHING
  `, [
    sparkRoundNumber,
    meridianContractAddress,
    meridianRoundIndex,
    MAX_TASKS_PER_NODE
  ])

  if (rowCount) {
    // We created a new SPARK round. Let's define retrieval tasks for this new round.
    // This is a short- to medium-term solution until we move to fully decentralized tasking
    await defineTasksForRound(pgClient, sparkRoundNumber)
  }
}

async function defineTasksForRound (pgClient, sparkRoundNumber) {
  await pgClient.query(`
    INSERT INTO retrieval_tasks (round_id, cid)
    SELECT $1 as round_id, cid
    FROM retrievable_deals
    WHERE expires_at > now()
    ORDER BY random()
    LIMIT $2;
  `, [
    sparkRoundNumber,
    TASKS_PER_ROUND
  ])
}
