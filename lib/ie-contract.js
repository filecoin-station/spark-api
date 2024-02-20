import { ethers } from 'ethers'
import { IE_CONTRACT_ABI, RPC_URL, GLIF_TOKEN } from '../spark-publish/ie-contract-config.js'

const provider = new ethers.providers.JsonRpcProvider({
  url: RPC_URL,
  headers: {
    Authorization: `Bearer ${GLIF_TOKEN}`
  }
})

// Uncomment for troubleshooting
// provider.on('debug', d => console.log('[ethers:debug] %s\nrequest: %o\nresponse: %o', d.action, d.request, d.response))

export const createMeridianContract = address => new ethers.Contract(
  address,
  IE_CONTRACT_ABI,
  provider
)
