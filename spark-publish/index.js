/* global File */

import timers from 'node:timers/promises'
import { record } from './lib/telemetry.js'

export const publish = async ({
  client,
  web3Storage,
  ieContract,
  maxMeasurements = 1000,
  logger = console
}) => {
  // Fetch measurements
  const { rows: measurements } = await client.query(`
    SELECT
      id,
      spark_version,
      zinnia_version,
      wallet_address,
      finished_at,
      success,
      timeout,
      start_at,
      status_code,
      first_byte_at,
      end_at,
      byte_length,
      attestation,
      cid,
      provider_address,
      protocol
    FROM measurements
    WHERE published_as IS NULL
    LIMIT $1
  `, [
    maxMeasurements
  ])
  logger.log(`Publishing ${measurements.length} measurements`)

  // Share measurements
  let start = new Date()
  const file = new File(
    [JSON.stringify(measurements)],
    'measurements.json',
    { type: 'application/json' }
  )
  const cid = await web3Storage.put([file])
  const uploadMeasurementsDuration = new Date() - start
  logger.log(`Measurements packaged in ${cid}`)

  // Call contract with CID
  logger.log('ie.addMeasurements()...')
  start = new Date()
  const tx = await ieContract.addMeasurements(cid.toString())
  const receipt = await tx.wait()
  const event = receipt.events.find(e => e.event === 'MeasurementsAdded')
  const { roundIndex } = event.args
  const ieAddMeasurementsDuration = new Date() - start
  logger.log('Measurements added to round', roundIndex.toString())

  // Mark measurements as shared
  await client.query(`
    UPDATE measurements
    SET published_as = $1
    WHERE id = ANY($2::int[])
  `, [
    cid.toString(),
    measurements.map(m => m.id)
  ])

  // TODO: Add cleanup
  // We're not sure if we're going to stick with web3.storage, or switch to
  // helia or another tool. Therefore, add this later.

  logger.log('Done!')

  record('publish', point => {
    point.intField('round_index', roundIndex)
    point.intField('measurements', measurements.length)
    point.intField(
      'upload_measurements_duration_ms',
      uploadMeasurementsDuration
    )
    point.intField('add_measurements_duration_ms', ieAddMeasurementsDuration)
  })
}

export const startPublishLoop = async ({
  client,
  web3Storage,
  ieContract,
  minRoundLength = 30_000,
  maxMeasurementsPerRound = 1000
}) => {
  while (true) {
    const lastStart = new Date()
    await publish({
      client,
      web3Storage,
      ieContract,
      maxMeasurements: maxMeasurementsPerRound
    })
    const dt = new Date() - lastStart
    if (dt < minRoundLength) await timers.setTimeout(minRoundLength - dt)
  }
}
