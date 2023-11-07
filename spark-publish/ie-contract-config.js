import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const {
  IE_CONTRACT_ADDRESS = '0xeeadb614b63dee83f0e7b4095094ae7c5d439ba2',
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
