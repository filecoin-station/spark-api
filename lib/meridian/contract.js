import { ethers } from 'ethers'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const {
  RPC_URL = 'https://api.calibration.node.glif.io/rpc/v0',
  MERIDIAN_CONTRACT_ADDRESS = '0xedb63b83ca55233432357a7aa2b150407f8ea256'
} = process.env

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

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
