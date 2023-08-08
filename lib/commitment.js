import timers from 'node:timers/promises'
import { MerkleTree } from 'merkletreejs'
import crypto from 'node:crypto'
import { Message } from '@glif/filecoin-message'
import { FilecoinNumber } from '@glif/filecoin-number'
import { default as Filecoin, HDWalletProvider } from '@glif/filecoin-wallet-provider'

const {
  MEASURE_CONTRACT_ADDRESS = 'bafy2bzaceaaszwfih2sp2grj3o6x2gfczjhixmch35oh23h3di4wwtfaksuzi',
  MEASURE_SERVICE_ADDRESS = 'f14mudjwy4qqenabn7263eg5qh2doin4my2zbf6oy',
  MEASURE_CONTRACT_METHOD_NUMBER = 'TODO',
  WALLET_SEED = 'start quote ticket foster hybrid sample hotel wool raven craft traffic velvet pig bargain enroll spider jaguar junior together country coyote royal curtain shrimp'
} = process.env

const provider = new Filecoin.default(new HDWalletProvider(WALLET_SEED), {
  apiAddress: 'https://api.node.glif.io/rpc/v0'
})

const MAX_MEASUREMENTS_PER_COMMITMENT = 10_000
const COMMITMENT_DELAY = 60_000

/**
 * @param {pg} client 
 * @returns {boolean} commitmentCapped
 */
const commit = async client => {
  console.log('creating commitment...')

  // Fetch measurements
  const { rows: measurements } = await client.query(`
    SELECT *
    FROM retrieval_results
    WHERE commitment_id IS NULL
    LIMIT $1;
  `, [
    MAX_MEASUREMENTS_PER_COMMITMENT
  ])
  if (measurements.length === 0) {
    console.log('no measurements to commit')
    return false
  }
  console.log(`committing ${measurements.length} measurements`)

  // Create Merkle tree
  const sha256 = str => crypto.createHash('sha256').update(str).digest()
  const leaves = measurements
    .map(measurement => sha256(JSON.stringify(measurement)))
  const tree = new MerkleTree(leaves, sha256, { sortLeaves: true })

  // Store Merkle tree
  const { rows: [commitment] } = await client.query(`
    INSERT INTO commitments (tree)
    VALUES ($1)
    RETURNING id;
  `, [
    MerkleTree.marshalTree(tree)
  ])
  console.log('created commitment')
  await client.query(`
    UPDATE retrieval_results
    SET commitment_id = $1
    WHERE retrieval_id IN (${measurements.map(({ retrieval_id }) => retrieval_id).join(', ')});
  `, [
    commitment.id
  ])
  console.log(`marked ${measurements.length} measurements as committed`)

  // Call contract with Merkle root hash
  const message = new Message({
    to: MEASURE_CONTRACT_ADDRESS,
    from: MEASURE_SERVICE_ADDRESS,
    nonce: await provider.getNonce(MEASURE_SERVICE_ADDRESS),
    value: new FilecoinNumber('0'),
    method: MEASURE_CONTRACT_METHOD_NUMBER,
    params: JSON.stringify({
      root: tree.getRoot().toString('hex')
    })
  })
  const messageWithGas = await provider.gasEstimateMessageGas(
    message.toLotusType()
  )
  const lotusMessage = messageWithGas.toLotusType()
  const signedMessage = await provider.wallet.sign(from, lotusMessage)
  const { '/': cid } = await provider.sendMessage(signedMessage)
  console.log('created commitment', { cid })

  return measurements.length === MAX_MEASUREMENTS_PER_COMMITMENT
}

export const runCommitmentLoop = async client => {
  while (true) {
    const commitmentCapped = await commit(client)
    if (!commitmentCapped) {
      await timers.setTimeout(COMMITMENT_DELAY)
    }
  }
}
