import assert from 'node:assert'

const {
  RPC_URLS = 'https://api.node.glif.io/rpc/v0,https://api.chain.love/rpc/v1',
  GLIF_TOKEN
} = process.env

assert(!!GLIF_TOKEN, 'GLIF_TOKEN must be provided in the environment variables')

const rpcUrls = RPC_URLS.split(',')

export {
  GLIF_TOKEN,
  rpcUrls
}
