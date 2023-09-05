import { createMeridianContract } from './meridian/contract.js'

export async function createRoundGetter (pgClient) {
  const contract = await createMeridianContract()

  let sparkRound
  const updateSparkRound = async (meridianRound) => {
    sparkRound = await mapCurrentMeridianRoundToSparkRound({
      meridianContractAddress: contract.address,
      meridianRound: BigInt(meridianRound),
      pgClient
    })
    console.log('SPARK round started: %s', sparkRound)
  }

  contract.on('RoundStart', updateSparkRound)
  updateSparkRound(await contract.currentRoundIndex())

  return () => sparkRound
}

export async function mapCurrentMeridianRoundToSparkRound ({
  meridianContractAddress,
  meridianRound,
  pgClient
}) {
  let sparkRound

  const { rows: [lastMeridianRecord] } = await pgClient.query(
    'SELECT * FROM meridian_rounds ORDER BY last_spark_round DESC LIMIT 1'
  )

  // More events coming from the same meridian contract
  if (lastMeridianRecord && lastMeridianRecord.contract_address === meridianContractAddress) {
    sparkRound = BigInt(lastMeridianRecord.spark_round_offset) + meridianRound
    await pgClient.query(
      'UPDATE meridian_rounds SET last_spark_round = $1 WHERE contract_address = $2',
      [sparkRound, meridianContractAddress]
    )
    console.log('Mapped %s IE round %s to SPARK round %s',
      meridianContractAddress,
      meridianRound,
      sparkRound
    )
  } else {
  // We are running for the first time and need to map the meridian round to spark round 1
  // Or the contract address has changed
    const lastSparkRound = BigInt(lastMeridianRecord?.last_spark_round ?? 0)
    sparkRound = lastSparkRound + 1n
    const sparkRoundOffset = sparkRound - meridianRound
    await pgClient.query(`
      INSERT INTO meridian_rounds
      (contract_address, spark_round_offset, last_spark_round)
      VALUES ($1, $2, $3)
    `, [
      meridianContractAddress,
      sparkRoundOffset,
      sparkRound
    ])
    console.log('Upgraded meridian contract from %s to %s, mapping IE round %s to SPARK round %s',
      lastMeridianRecord?.contract_address ?? '<n/a>',
      meridianContractAddress,
      meridianRound,
      sparkRound
    )
  }

  await pgClient.query(`
    INSERT INTO spark_rounds
    (id, created_at)
    VALUES ($1, now())
    ON CONFLICT DO NOTHING
  `, [
    sparkRound
  ])

  return sparkRound
}
