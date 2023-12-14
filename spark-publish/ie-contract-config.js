import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const {
  IE_CONTRACT_ADDRESS = '0xaaef78eaf86dcf34f275288752e892424dda9341',
  RPC_URLS = 'https://api.node.glif.io/rpc/v0,https://api.chain.love/rpc/v1'
} = process.env

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
  rpcUrls,
  IE_CONTRACT_ABI
}
