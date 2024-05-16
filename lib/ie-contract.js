import { ethers } from 'ethers'
import { IE_CONTRACT_ABI, IE_CONTRACT_ADDRESS, RPC_URL, GLIF_TOKEN } from '../spark-publish/ie-contract-config.js'

const fetchRequest = new ethers.FetchRequest(RPC_URL)
fetchRequest.setHeader('Authorization', `Bearer ${GLIF_TOKEN}`)
const provider = new ethers.JsonRpcProvider(fetchRequest, undefined, {
  polling: true
})

// Uncomment for troubleshooting
// provider.on('debug', d => console.log('[ethers:debug] %s %o', d.action, d.payload ?? d.result))

export const createMeridianContract = async () => new ethers.Contract(
  IE_CONTRACT_ADDRESS,
  IE_CONTRACT_ABI,
  provider
)
