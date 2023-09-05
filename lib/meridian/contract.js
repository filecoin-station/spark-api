import { ethers } from 'ethers'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const {
  RPC_URL = 'https://api.calibration.node.glif.io/rpc/v0',
  MERIDIAN_CONTRACT_ADDRESS = '0x816830a1e536784ecb37cf97dfd7a98a82c86643'
} = process.env

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

// Uncomment for troubleshooting
// provider.on('debug', d => console.log('[ethers:debug] %s\nrequest: %o\nresponse: %o', d.action, d.request, d.response))

export const createMeridianContract = async () => new ethers.Contract(
  MERIDIAN_CONTRACT_ADDRESS,
  JSON.parse(
    await fs.readFile(
      fileURLToPath(new URL('./abi.json', import.meta.url)),
      'utf8'
    )
  ),
  provider
)
