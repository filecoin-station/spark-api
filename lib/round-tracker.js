import Sentry from '@sentry/node'
import { createMeridianContract } from './ie-contract.js'

// The number of tasks per round is proportionate to the module round length - longer rounds require
// more tasks per round.
//
// See https://www.notion.so/pl-strflt/module-tasking-v2-604e26d57f6b4892946525bcb3a77104?pvs=4#ded1cd98c2664a2289453d38e2715643
// for more details, this constant represents TC (tasks per committee).
//
// We will need to tweak this value based on measurements; that's why I put it here as a constant.
export const TASKS_PER_ROUND = 1000

// How many tasks is each module node expected to complete every round (at most).
export const MAX_TASKS_PER_NODE = 15

/**
 * @param {import('pg').Pool} pgPool
 * @returns {() => {
 *  moduleRoundNumberes: Map<string, bigint>;
 *  meridianContractAddress: Map<string, string>;
 *  meridianRoundIndex: Map<string, bigint>;
 * }}
 */
export async function createRoundGetter (pgPool) {
  const { rows: modules } = await client.query(
    'SELECT id, contract_address AS contractAddress FROM modules'
  )
  const moduleRoundNumbers = new Map()
  const meridianContractAddresses = new Map()
  const meridianRoundIndexes = new Map()

  for (const mod of modules) {
    meridianContractAddresses.set(mod.id, mod.contractAddress)
    const contract = createMeridianContract(mod.contractAddress)

    const updateModuleRound = async (newRoundIndex) => {
      meridianRoundIndexes.set(mod.id, BigInt(newRoundIndex))

      const pgClient = await pgPool.connect()
      try {
        await pgClient.query('BEGIN')
        moduleRoundNumbers.set(mod.id, await mapCurrentMeridianRoundToModuleRound({
          moduleId: mod.id,
          moduleContractAddress: mod.contractAddress,
          meridianRoundIndex: meridianRoundIndexes.get(mod.id),
          pgClient
        }))
        await pgClient.query('COMMIT')
        console.log('%s round started: %s', mod.name, moduleRoundNumber)
      } catch (err) {
        await pgClient.query('ROLLBACK')
      } finally {
        pgClient.release()
      }
    }

    contract.on('RoundStart', (newRoundIndex) => {
      updateModuleRound(newRoundIndex).catch(err => {
        console.error('Cannot handle RoundStart:', err)
        Sentry.captureException(err)
      })
    })

    await updateModuleRound(await contract.currentRoundIndex())
  }
  
  return () => ({
    moduleRoundNumbers,
    meridianContractAddresses,
    meridianRoundIndexes
  })
}

/*
There are three cases we need to handle:

1. Business as usual - the IE contract advanced the round by one
2. Fresh start, e.g. a new meridian-api instance is deployed, or we deploy this PR to an existing instance.
3. Upgrade of the IE contract

For each IE version (defined as the smart contract address), we are keeping track of three fields:
- `contractAddress`
- `moduleRoundOffset`
- `lastmoduleRoundNumber`

Whenever a new IE round is started, we know the current IE round number (`meridianRoundIndex`)

Let me explain how are the different cases handled.

**Business as usual**

We want to map IE round number to module round number. This assumes we have already initialised our
DB for the current IE contract version we are working with.

```
moduleRoundNumber = meridianRoundIndex + moduleRoundOffset
```

For example, if we observe IE round 123, then `moduleRoundOffset` is `-122` and we calculate the
module round as `123 + (-122) = 1`.

We update the record for the current IE contract address
to set `last_module_round_number = moduleRoundNumber`.

**Fresh start**

There is no record in our DB. We want to map the current IE round number to module round 1. Also, we
want to setup `moduleRoundOffset` so that the algorithm above produces correct module round numbers.

```
moduleRoundNumber = 1
moduleRoundOffset = moduleRoundNumber - meridianRoundIndex
```

We insert a new record to our DB with the address of the current IE contract, `moduleRoundOffset`,
and `last_module_round_number = moduleRoundNumber`.

**Upgrading IE contract**

We have one or more existing records in our DB. We know what is the last module round that we
calculated from the previous version of the IE contract (`lastmoduleRoundNumber`). We also know what
is the round number of the new IE contract.

```
moduleRoundNumber = lastmoduleRoundNumber + 1
moduleRoundOffset = moduleRoundNumber - meridianRoundIndex
```

We insert a new record to our DB with the address of the current IE contract, `moduleRoundOffset`,
and `last_module_round_number = moduleRoundNumber`.

If you are wondering how to find out what is the last module round that we calculated from the
previous version of the IE contract - we can easily find it in our DB:

```sql
SELECT last_module_round_number
FROM meridian_contract_versions
ORDER BY last_module_round_number DESC
LIMIT 1
```
*/

export async function mapCurrentMeridianRoundToModuleRound ({
  moduleId,
  meridianContractAddress,
  meridianRoundIndex,
  pgClient
}) {
  let moduleRoundNumber

  const { rows: [contractVersionOfPreviousModuleRound] } = await pgClient.query(`
    SELECT * FROM meridian_contract_versions
      WHERE module_id = $1
      ORDER BY last_module_round_number DESC
      LIMIT 1
  `, [moduleId])

  // More events coming from the same meridian contract
  if (contractVersionOfPreviousModuleRound?.contract_address === meridianContractAddress) {
    moduleRoundNumber = BigInt(contractVersionOfPreviousModuleRound.module_round_offset) + meridianRoundIndex
    await pgClient.query(
      'UPDATE meridian_contract_versions SET last_module_round_number = $1 WHERE contract_address = $2',
      [moduleRoundNumber, meridianContractAddress]
    )
    console.log('Mapped %s IE round index %s to module round number %s',
      meridianContractAddress,
      meridianRoundIndex,
      moduleRoundNumber
    )
  } else {
    // We are running for the first time and need to map the meridian round to module round 1
    // Or the contract address has changed
    const lastmoduleRoundNumber = BigInt(contractVersionOfPreviousModuleRound?.last_module_round_number ?? 0)
    moduleRoundNumber = lastmoduleRoundNumber + 1n
    const moduleRoundOffset = moduleRoundNumber - meridianRoundIndex

    // TODO(bajtos) If we are were are reverting back to a contract address (version) we were
    // using sometime in the past, the query above will fail. We can fix the problem and support
    // this edge case by telling Postgres to ignore conflicts (`ON CONFLICT DO NOTHING)`
    await pgClient.query(`
      INSERT INTO meridian_contract_versions
      (contract_address, module_round_offset, last_module_round_number, first_module_round_number, module_id)
      VALUES ($1, $2, $3, $3, $4)
    `, [
      meridianContractAddress,
      moduleRoundOffset,
      moduleRoundNumber,
      moduleId
    ])
    console.log(
      'Upgraded meridian contract from %s to %s, mapping IE round index %s to module round number %s',
      contractVersionOfPreviousModuleRound?.contract_address ?? '<n/a>',
      meridianContractAddress,
      meridianRoundIndex,
      moduleRoundNumber
    )
  }

  await maybeCreateModuleRound(pgClient, { moduleRoundNumber, meridianContractAddress, meridianRoundIndex, moduleId })

  return moduleRoundNumber
}

export async function maybeCreateModuleRound (pgClient, {
  moduleRoundNumber,
  meridianContractAddress,
  meridianRoundIndex,
  moduleId
}) {
  const { rowCount } = await pgClient.query(`
    INSERT INTO module_round
    (id, created_at, meridian_address, meridian_round, max_tasks_per_node, module_id)
    VALUES ($1, now(), $2, $3, $4, $5)
    ON CONFLICT DO NOTHING
  `, [
    moduleRoundNumber,
    meridianContractAddress,
    meridianRoundIndex,
    MAX_TASKS_PER_NODE,
    moduleId
  ])

  if (rowCount) {
    // We created a new module round. Let's define retrieval tasks for this new round.
    // This is a short- to medium-term solution until we move to fully decentralized tasking
    await defineTasksForRound(pgClient, moduleRoundNumber, moduleId)
  }
}

async function defineTasksForRound (pgClient, moduleRoundNumber, moduleId) {
  await pgClient.query(`
    INSERT INTO retrieval_tasks (round_id, cid, provider_address, protocol, module_id)
    SELECT $1 as round_id, cid, provider_address, protocol, module_id
    FROM retrieval_templates
    WHERE module_id = $3
    ORDER BY random()
    LIMIT $2;
  `, [
    moduleRoundNumber,
    TASKS_PER_ROUND,
    moduleId
  ])
}
