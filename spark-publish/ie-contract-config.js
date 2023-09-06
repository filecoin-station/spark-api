import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const {
  IE_CONTRACT_ADDRESS = '0x816830a1e536784ecb37cf97dfd7a98a82c86643',
  RPC_URL = 'https://api.calibration.node.glif.io/rpc/v0'
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
