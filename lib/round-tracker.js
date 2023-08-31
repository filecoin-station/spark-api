/*
const {
  RPC_URL = 'https://api.calibration.node.glif.io/rpc/v0',
  MERIDIAN_CONTRACT_ADDRESS = '0x816830a1e536784ecb37cf97dfd7a98a82c86643',
} = process.env
*/

export async function mapCurrentMeridianRoundToSparkRound ({
  meridianContractAddress,
  meridianRound,
  pgClient
}) {
  const { rows: [lastMeridianRecord] } = await pgClient.query(
    'SELECT * FROM meridian_rounds ORDER BY last_spark_round DESC LIMIT 1'
  )

  // More events coming from the same meridian contract
  if (lastMeridianRecord && lastMeridianRecord.contract_address === meridianContractAddress) {
    const sparkRound = BigInt(lastMeridianRecord.spark_round_offset) + meridianRound
    await pgClient.query(
      'UPDATE meridian_rounds SET last_spark_round = $1 WHERE contract_address = $2',
      [sparkRound, meridianContractAddress]
    )
    console.log('Mapped %s IE round %s to SPARK round %s',
      meridianContractAddress,
      meridianRound,
      sparkRound
    )
    return sparkRound
  }

  // We are running for the first time and need to map the meridian round to spark round 1
  // Or the contract address has changed
  const lastSparkRound = BigInt(lastMeridianRecord?.last_spark_round ?? 0)
  const sparkRound = lastSparkRound + 1n
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
  return sparkRound
}
