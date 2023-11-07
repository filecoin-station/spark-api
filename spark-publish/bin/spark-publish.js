import pg from 'pg'
import { startPublishLoop } from '../index.js'
import { IE_CONTRACT_ABI, IE_CONTRACT_ADDRESS, RPC_URL } from '../ie-contract-config.js'
import Sentry from '@sentry/node'
import assert from 'node:assert'
import { Web3Storage } from 'web3.storage'
import { ethers } from 'ethers'
import { newDelegatedEthAddress } from '@glif/filecoin-address'

const {
  DATABASE_URL,
  SENTRY_ENVIRONMENT = 'development',
  WALLET_SEED,
  WEB3_STORAGE_API_TOKEN,
  MIN_ROUND_LENGTH_SECONDS = 30,
  MAX_MEASUREMENTS_PER_ROUND = 1000
} = process.env

Sentry.init({
  dsn: 'https://b5bd47a165dcd801408bc14d9fcbc1c3@o1408530.ingest.sentry.io/4505861814878208',
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1
})

assert(WALLET_SEED, 'WALLET_SEED required')
assert(WEB3_STORAGE_API_TOKEN, 'WEB3_STORAGE_API_TOKEN required')

const client = new pg.Pool({ connectionString: DATABASE_URL })
const web3Storage = new Web3Storage({ token: WEB3_STORAGE_API_TOKEN })
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
