// Run `publish()` in a short lived script, to help with memory issues

import '../lib/instrument.js'
import { publish } from '../index.js'
import pg from 'pg'
import * as Client from '@web3-storage/w3up-client'
import { ed25519 } from '@ucanto/principal'
import { CarReader } from '@ipld/car'
import { importDAG } from '@ucanto/core/delegation'
import { ethers } from 'ethers'
import {
  IE_CONTRACT_ABI,
  IE_CONTRACT_ADDRESS,
  RPC_URL,
  GLIF_TOKEN
} from '../ie-contract-config.js'
import assert from 'node:assert'
import { writeClient } from '../lib/telemetry.js'

const {
  DATABASE_URL,
  SENTRY_ENVIRONMENT = 'development',
  WALLET_SEED,
  MAX_MEASUREMENTS_PER_ROUND = 1000,
  // See https://web3.storage/docs/how-to/upload/#bring-your-own-agent
  W3UP_PRIVATE_KEY,
  W3UP_PROOF
} = process.env

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

const fetchRequest = new ethers.FetchRequest(RPC_URL)
fetchRequest.setHeader('Authorization', `Bearer ${GLIF_TOKEN}`)
const provider = new ethers.JsonRpcProvider(
  fetchRequest,
  null,
  { batchMaxCount: 1 }
)
const signer = ethers.Wallet.fromPhrase(WALLET_SEED, provider)
const ieContract = new ethers.Contract(
  IE_CONTRACT_ADDRESS,
  IE_CONTRACT_ABI,
  provider
).connect(signer)

try {
  await publish({
    client,
    web3Storage,
    ieContract,
    maxMeasurements: MAX_MEASUREMENTS_PER_ROUND
  })
} finally {
  // Ensure telemetry has been submitted before exiting
  try {
    await writeClient.flush()
  } catch (err) {
    console.error(err)
  }
}
process.exit(0)
