import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const {
  IE_CONTRACT_ADDRESS = '0xaaef78eaf86dcf34f275288752e892424dda9341',
  RPC_URL = 'https://api.node.glif.io/rpc/v0'
} = process.env

const IE_CONTRACT_ABI = JSON.parse(
  await fs.readFile(
    fileURLToPath(new URL('abi.json', import.meta.url)),
    'utf8'
  )
)

export {
  IE_CONTRACT_ADDRESS,
  RPC_URL,
  IE_CONTRACT_ABI
}
