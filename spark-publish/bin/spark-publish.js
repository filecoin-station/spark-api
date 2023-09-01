import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { startPublishLoop } from '../index.js'
import Sentry from '@sentry/node'
import assert from 'node:assert'
import { Web3Storage } from 'web3.storage'
import { ethers } from 'ethers'
import { newDelegatedEthAddress } from '@glif/filecoin-address'

const {
  DATABASE_URL,
  IE_CONTRACT_ADDRESS = '0x816830a1e536784ecb37cf97dfd7a98a82c86643',
  RPC_URL = 'https://api.calibration.node.glif.io/rpc/v0',
  SENTRY_ENVIRONMMENT = 'development',
  WALLET_SEED,
  WEB3_STORAGE_API_TOKEN
} = process.env

Sentry.init({
  dsn: 'https://4a55431b256641f98f6a51651526831f@o1408530.ingest.sentry.io/4505199717122048',
  environment: SENTRY_ENVIRONMMENT,
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
  JSON.parse(
    await fs.readFile(
      fileURLToPath(new URL('../abi.json', import.meta.url)),
      'utf8'
    )
  ),
  provider
).connect(signer)

console.log(
  'Wallet address:',
  signer.address,
  newDelegatedEthAddress(signer.address, 't').toString()
)

await startPublishLoop({
  client,
  web3Storage,
  ieContract
})
