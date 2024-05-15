import assert from 'node:assert'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const {
  IE_CONTRACT_ADDRESS = '0x8460766Edc62B525fc1FA4D628FC79229dC73031',
  RPC_URLS = 'https://api.node.glif.io/rpc/v0,https://api.chain.love/rpc/v1',
  GLIF_TOKEN
} = process.env

assert(!!GLIF_TOKEN, 'GLIF_TOKEN must be provided in the environment variables')

const rpcUrls = RPC_URLS.split(',')
const RPC_URL = rpcUrls[Math.floor(Math.random() * rpcUrls.length)]
console.log(`Selected JSON-RPC endpoint ${RPC_URL}`)

const IE_CONTRACT_ABI = JSON.parse(
  await fs.readFile(
    fileURLToPath(new URL('abi.json', import.meta.url)),
    'utf8'
  )
)

export {
  IE_CONTRACT_ADDRESS,
  RPC_URL,
  GLIF_TOKEN,
  rpcUrls,
  IE_CONTRACT_ABI
}
