import timers from 'node:timers/promises'
import { ethers } from 'ethers'
import { createHelia } from 'helia'
import { dagCbor } from '@helia/dag-cbor'

const {
  IE_ADDRESS = 'bafy2bzaceaaszwfih2sp2grj3o6x2gfczjhixmch35oh23h3di4wwtfaksuzi',
  WALLET_SEED = 'start quote ticket foster hybrid sample hotel wool raven craft traffic velvet pig bargain enroll spider jaguar junior together country coyote royal curtain shrimp'
} = process.env

const provider = new ethers.providers.JsonRpcProvider()
const signer = provider.getSigner()
const ieABI = [
  "function addMeasurement(string cid)"
]
const ie = new ethers.Contract(IE_ADDRESS, ieABI, provider)
const ieWithSigner = ie.connect(signer)

const helia = await createHelia()
const heliaDagCbor = dagCbor(helia)

const MAX_MEASUREMENTS_PER_PUBLISH = 10_000
const PUBLISH_DELAY = 60_000

/**
 * @param {pg} client 
 * @returns {boolean} measurementsCapped
 */
const publish = async client => {
  console.log('publishing measurements...')

  // Fetch measurements
  const { rows: measurements } = await client.query(`
    SELECT *
    FROM retrieval_results
    WHERE cid IS NULL
    LIMIT $1;
  `, [
    MAX_MEASUREMENTS_PER_PUBLISH
  ])
  if (measurements.length === 0) {
    console.log('no measurements to publish')
    return false
  }
  console.log(`publishing ${measurements.length} measurements`)

  // Share measurements
  const cid = await heliaDagCbor.add(measurements)
  await helia.pins.add(cid)

  // Store CID)
  await client.query(`
    UPDATE retrieval_results
    SET cid = $1
    WHERE retrieval_id IN (${measurements.map(({ retrieval_id }) => retrieval_id).join(', ')});
  `, [
    cid
  ])
  console.log(`marked ${measurements.length} measurements as published`)

  ieWithSigner.addMeasurement('cid')

  return measurements.length === MAX_MEASUREMENTS_PER_PUBLISH
}

export const runPublishLoop = async client => {
  while (true) {
    const measurementsCapped = await publish(client)
    if (!measurementsCapped) {
      await timers.setTimeout(PUBLISH_DELAY)
    }
  }
}
