import pg from 'pg'
import { startPublishLoop } from '../index.js'
import { IE_CONTRACT_ABI, IE_CONTRACT_ADDRESS, RPC_URL } from '../ie-contract-config.js'
import Sentry from '@sentry/node'
import assert from 'node:assert'
import * as Client from '@web3-storage/w3up-client'
import { ed25519 } from '@ucanto/principal'
import { CarReader } from '@ipld/car'
import { importDAG } from '@ucanto/core/delegation'
import { ethers } from 'ethers'
import { newDelegatedEthAddress } from '@glif/filecoin-address'

const {
  DATABASE_URL,
  SENTRY_ENVIRONMENT = 'development',
  WALLET_SEED,
  MIN_ROUND_LENGTH_SECONDS = 120,
  MAX_MEASUREMENTS_PER_ROUND = 1000,
  // See https://web3.storage/docs/how-to/upload/#bring-your-own-agent
  W3UP_PRIVATE_KEY,
  W3UP_PROOF
} = process.env

Sentry.init({
  dsn: 'https://b5bd47a165dcd801408bc14d9fcbc1c3@o1408530.ingest.sentry.io/4505861814878208',
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1
})

assert(WALLET_SEED, 'WALLET_SEED required')
assert(W3UP_PRIVATE_KEY, 'W3UP_PRIVATE_KEY required')
assert(W3UP_PROOF, 'W3UP_PROOF required')

const client = new pg.Pool({ connectionString: DATABASE_URL })

async function parseProof (data) {
  const blocks = []
  const reader = await CarReader.fromBytes(Buffer.from(data, 'base64'))
  for await (const block of reader.blocks()) {
    blocks.push(block)
  }
  return importDAG(blocks)
}

const principal = ed25519.Signer.parse(W3UP_PRIVATE_KEY)
const web3Storage = await Client.create({ principal })
const proof = await parseProof(W3UP_PROOF)
const space = await web3Storage.addSpace(proof)
await web3Storage.setCurrentSpace(space.did())

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
const signer = ethers.Wallet.fromMnemonic(WALLET_SEED).connect(provider)
const ieContract = new ethers.Contract(
  IE_CONTRACT_ADDRESS,
  IE_CONTRACT_ABI,
  provider
).connect(signer)

console.log(
  'Wallet address:',
  signer.address,
  newDelegatedEthAddress(signer.address, 'f').toString()
)

await startPublishLoop({
  client,
  web3Storage,
  ieContract,
  minRoundLength: MIN_ROUND_LENGTH_SECONDS * 1000,
  maxMeasurementsPerRound: MAX_MEASUREMENTS_PER_ROUND
})
