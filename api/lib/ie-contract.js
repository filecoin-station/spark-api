import { ethers } from 'ethers'
import { rpcUrls, GLIF_TOKEN } from '../../common/ie-contract-config.js'
import * as SparkImpactEvaluator from '@filecoin-station/spark-impact-evaluator'

const provider = new ethers.FallbackProvider(rpcUrls.map(rpcUrl => {
  const fetchRequest = new ethers.FetchRequest(rpcUrl)
  fetchRequest.setHeader('Authorization', `Bearer ${GLIF_TOKEN}`)
  return new ethers.JsonRpcProvider(fetchRequest, null, { polling: true })
}))

// Uncomment for troubleshooting
// provider.on('debug', d => console.log('[ethers:debug %s] %s %o', new Date().toISOString().split('T')[1], d.action, d.payload ?? d.result))

export const createMeridianContract = async () => new ethers.Contract(
  SparkImpactEvaluator.ADDRESS,
  SparkImpactEvaluator.ABI,
  provider
)
