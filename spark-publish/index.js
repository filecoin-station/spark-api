/* global File */

import timers from 'node:timers/promises'

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
      r.id,
      r.created_at,
      r.spark_version,
      r.zinnia_version,
      rr.finished_at,
      rr.success,
      rr.timeout,
      rr.start_at,
      rr.status_code,
      rr.first_byte_at,
      rr.end_at,
      rr.byte_length,
      rr.attestation,
      rt.cid,
      rt.provider_address,
      rt.protocol
    FROM retrievals r
    JOIN retrieval_templates rt ON r.retrieval_template_id = rt.id
    LEFT JOIN retrieval_results rr ON r.id = rr.retrieval_id
    WHERE r.published_as IS NULL
    LIMIT $1
  `, [
    maxMeasurements
  ])
  logger.log(`Publishing ${measurements.length} measurements`)

  // Share measurements
  const file = new File(
    [JSON.stringify(measurements)],
    'measurements.json',
    { type: 'application/json' }
  )
  const cid = await web3Storage.put([file])
  logger.log(`Measurements packaged in ${cid}`)

  // Call contract with CID
  logger.log('ie.addMeasurements()...')
  const tx = await ieContract.addMeasurements(cid.toString())
  const receipt = await tx.wait()
  const event = receipt.events.find(e => e.event === 'MeasurementsAdded')
  const { roundIndex } = event.args
  logger.log('Measurements added to round', roundIndex.toString())

  // Mark measurements as shared
  await client.query(`
    UPDATE retrievals
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
