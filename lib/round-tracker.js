import Sentry from '@sentry/node'
import { createMeridianContract } from './meridian/contract.js'

export async function createRoundGetter (pgClient) {
  const contract = await createMeridianContract()

  let sparkRoundNumber
  const updateSparkRound = async (meridianRoundIndex) => {
    sparkRoundNumber = await mapCurrentMeridianRoundToSparkRound({
      meridianContractAddress: contract.address,
      meridianRoundIndex: BigInt(meridianRoundIndex),
      pgClient
    })
    console.log('SPARK round started: %s', sparkRoundNumber)
  }

  contract.on('RoundStart', () => {
    updateSparkRound().catch(err => {
      console.error('Cannot handle RoundStart:', err)
      Sentry.captureException(err)
    })
  })

  updateSparkRound(await contract.currentRoundIndex())

  return () => sparkRoundNumber
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

We update the record for the current IE contract address to set `last_spark_round = sparkRoundNumber`.

**Fresh start**

There is no record in our DB. We want to map the current IE round number to SPARK round 1. Also, we
want to setup `sparkRoundOffset` so that the algorithm above produces correct SPARK round numbers.

```
sparkRoundNumber = 1
sparkRoundOffset = sparkRoundNumber - meridianRoundIndex
```

We insert a new record to our DB with the address of the current IE contract, `sparkRoundOffset`,
and `last_spark_round = sparkRoundNumber`.

**Upgrading IE contract**

We have one or more existing records in our DB. We know what is the last SPARK round that we
calculated from the previous version of the IE contract (`lastSparkRoundNumber`). We also know what
is the round number of the new IE contract.

```
sparkRoundNumber = lastSparkRoundNumber + 1
sparkRoundOffset = sparkRoundNumber - meridianRoundIndex
```

We insert a new record to our DB with the address of the current IE contract, `sparkRoundOffset`,
and `last_spark_round = sparkRoundNumber`.

If you are wondering how to find out what is the last SPARK round that we calculated from the
previous version of the IE contract - we can easily find it in our DB:

```sql
SELECT last_spark_round FROM meridian_contract_versions ORDER BY last_spark_round DESC LIMIT 1
```
*/

export async function mapCurrentMeridianRoundToSparkRound ({
  meridianContractAddress,
  meridianRoundIndex,
  pgClient
}) {
  let sparkRoundNumber

  const { rows: [contractVersionOfPreviousSparkRound] } = await pgClient.query(
    'SELECT * FROM meridian_contract_versions ORDER BY last_spark_round DESC LIMIT 1'
  )

  // More events coming from the same meridian contract
  if (contractVersionOfPreviousSparkRound?.contract_address === meridianContractAddress) {
    sparkRoundNumber = BigInt(contractVersionOfPreviousSparkRound.spark_round_offset) + meridianRoundIndex
    await pgClient.query(
      'UPDATE meridian_contract_versions SET last_spark_round = $1 WHERE contract_address = $2',
      [sparkRoundNumber, meridianContractAddress]
    )
    console.log('Mapped %s IE round %s to SPARK round %s',
      meridianContractAddress,
      meridianRoundIndex,
      sparkRoundNumber
    )
  } else {
    // We are running for the first time and need to map the meridian round to spark round 1
    // Or the contract address has changed
    const lastSparkRoundNumber = BigInt(contractVersionOfPreviousSparkRound?.last_spark_round ?? 0)
    sparkRoundNumber = lastSparkRoundNumber + 1n
    const sparkRoundOffset = sparkRoundNumber - meridianRoundIndex

    // TODO(bajtos) If we are were are reverting back to a contract address (version) we were
    // using sometime in the past, the query above will fail. We can fix the problem and support
    // this edge case by telling Postgres to ignore conflicts (`ON CONFLICT DO NOTHING)`
    await pgClient.query(`
      INSERT INTO meridian_contract_versions
      (contract_address, spark_round_offset, last_spark_round)
      VALUES ($1, $2, $3)
    `, [
      meridianContractAddress,
      sparkRoundOffset,
      sparkRoundNumber
    ])
    console.log('Upgraded meridian contract from %s to %s, mapping IE round %s to SPARK round %s',
      contractVersionOfPreviousSparkRound?.contract_address ?? '<n/a>',
      meridianContractAddress,
      meridianRoundIndex,
      sparkRoundNumber
    )
  }

  await pgClient.query(`
    INSERT INTO spark_rounds
    (id, created_at)
    VALUES ($1, now())
    ON CONFLICT DO NOTHING
  `, [
    sparkRoundNumber
  ])

  return sparkRoundNumber
}
