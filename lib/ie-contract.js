import { ethers } from 'ethers'
import { IE_CONTRACT_ABI, IE_CONTRACT_ADDRESS, rpcUrls } from '../spark-publish/ie-contract-config.js'

const provider = new ethers.providers.FallbackProvider(
  rpcUrls.map(url => new ethers.providers.JsonRpcProvider(url))
)

// Uncomment for troubleshooting
// provider.on('debug', d => console.log('[ethers:debug] %s\nrequest: %o\nresponse: %o', d.action, d.request, d.response))

export const createMeridianContract = async () => new ethers.Contract(
  IE_CONTRACT_ADDRESS,
  IE_CONTRACT_ABI,
  provider
)
