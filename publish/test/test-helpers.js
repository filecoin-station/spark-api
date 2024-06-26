export * from './platform-test-helpers.js'

/**
 * @param {import('pg').Client} client
 * @param {object} measurement
 */
export const insertMeasurement = async (client, measurement) => {
  await client.query(`
  INSERT INTO measurements (
    spark_version,
    zinnia_version,
    cid,
    provider_address,
    protocol,
    participant_address,
    timeout,
    start_at,
    status_code,
    first_byte_at,
    end_at,
    byte_length,
    attestation,
    inet_group,
    car_too_large,
    car_checksum,
    indexer_result,
    miner_id,
    provider_id,
    completed_at_round
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
  )
`, [
    measurement.sparkVersion,
    measurement.zinniaVersion,
    measurement.cid,
    measurement.providerAddress,
    measurement.protocol,
    measurement.participantAddress,
    measurement.timeout,
    measurement.startAt,
    measurement.statusCode,
    measurement.firstByteAt,
    measurement.endAt,
    measurement.byteLength,
    measurement.attestation,
    measurement.inetGroup,
    measurement.carTooLarge,
    measurement.carChecksum,
    measurement.indexerResult,
    measurement.minerId,
    measurement.providerId,
    measurement.round
  ])
}
