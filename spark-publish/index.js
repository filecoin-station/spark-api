/* global File */

import pRetry from 'p-retry'
import { record } from './lib/telemetry.js'

export const publish = async ({
  client: pgPool,
  web3Storage,
  ieContract,
  maxMeasurements = 1000,
  logger = console
}) => {
  // Fetch measurements
  const { rows: measurements } = await pgPool.query(`
    SELECT
      id,
      spark_version,
      zinnia_version,
      participant_address,
      station_id,
      finished_at,
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
      cid,
      provider_address,
      protocol
    FROM measurements
    LIMIT $1
  `, [
    maxMeasurements
  ])

  // Fetch the count of all unpublished measurements - we need this for monitoring
  // Note: this number will be higher than `measurements.length` because spark-api adds more
  // measurements in between the previous and the next query.
  const totalCount = (await pgPool.query(
    'SELECT COUNT(*) FROM measurements'
  )).rows[0].count

  logger.log(`Publishing ${measurements.length} measurements. Total unpublished: ${totalCount}. Batch size: ${maxMeasurements}.`)

  // Share measurements
  let start = new Date()
  const file = new File(
    [measurements.map(m => JSON.stringify(m)).join('\n')],
    'measurements.ndjson',
    { type: 'application/json' }
  )
  const cid = await web3Storage.uploadFile(file)
  const uploadMeasurementsDuration = new Date() - start
  logger.log(`Measurements packaged in ${cid}`)

  // Call contract with CID
  logger.log('Invoking ie.addMeasurements()...')
  start = new Date()
  const tx = await ieContract.addMeasurements(cid.toString())
  logger.log('Waiting for the transaction receipt:', tx.hash)
  const receipt = await pRetry(
    () => tx.wait(
      1, // confirmation(s)
      120_000 // 2 minutes
    ), {
      onFailedAttempt: err => console.error(err),
      shouldRetry: err => err.code !== 'CALL_EXCEPTION',
      maxRetryTime: 600_000 // 10-minute timeout
    }
  )
  const log = ieContract.interface.parseLog(receipt.logs[0])
  const roundIndex = log.args[1]
  const ieAddMeasurementsDuration = new Date() - start
  logger.log('Measurements added to round %s in %sms', roundIndex.toString(), ieAddMeasurementsDuration)

  const pgClient = await pgPool.connect()
  try {
    await pgClient.query('BEGIN')

    // Delete published measurements
    await pgClient.query(`
      DELETE FROM measurements
      WHERE id = ANY($1::bigint[])
    `, [
      measurements.map(m => m.id)
    ])

    // Record the commitment for future queries
    // TODO: store also ieContract.address and roundIndex
    await pgClient.query('INSERT INTO commitments (cid, published_at) VALUES ($1, $2)', [
      cid.toString(), new Date()
    ])

    await pgClient.query('COMMIT')
  } catch (err) {
    await pgClient.query('ROLLBACK')
    throw err
  } finally {
    pgClient.release()
  }

  await pgPool.query('VACUUM measurements')

  // TODO: Add cleanup
  // We're not sure if we're going to stick with web3.storage, or switch to
  // helia or another tool. Therefore, add this later.

  logger.log('Done!')

  record('publish', point => {
    point.intField('round_index', roundIndex)
    point.intField('measurements', measurements.length)
    point.floatField('load', totalCount / maxMeasurements)
    point.intField(
      'upload_measurements_duration_ms',
      uploadMeasurementsDuration
    )
    point.intField('add_measurements_duration_ms', ieAddMeasurementsDuration)
  })
}
