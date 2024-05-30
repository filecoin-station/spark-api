import { ethers } from 'ethers'
import { RPC_URL, GLIF_TOKEN } from '../../common/ie-contract-config.js'
import * as SparkImpactEvaluator from '@filecoin-station/spark-impact-evaluator'

const fetchRequest = new ethers.FetchRequest(RPC_URL)
fetchRequest.setHeader('Authorization', `Bearer ${GLIF_TOKEN}`)
const provider = new ethers.JsonRpcProvider(fetchRequest, undefined, {
  polling: true
})

// Uncomment for troubleshooting
// provider.on('debug', d => console.log('[ethers:debug %s] %s %o', new Date().toISOString().split('T')[1], d.action, d.payload ?? d.result))

export const createMeridianContract = async () => new ethers.Contract(
  SparkImpactEvaluator.ADDRESS,
  SparkImpactEvaluator.ABI,
  provider
)
