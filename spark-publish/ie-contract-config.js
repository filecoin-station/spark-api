import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const {
  IE_CONTRACT_ADDRESS = '0x8c9f415ee86e65ec72d08b05c42cdc40bfecb8e5',
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
