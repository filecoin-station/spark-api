import varint from 'varint'

const [,, cid] = process.argv

const res = await fetch(`https://cid.contact/cid/${cid}`)
const body = await res.json()
const providerResult = body.MultihashResults[0].ProviderResults[0]
console.log({
  providerAddress: providerResult.Provider.Addrs[0],
  protocol: {
    0x900: 'bitswap',
    0x910: 'graphsync',
    4128768: 'graphsync'
  }[varint.decode(Buffer.from(providerResult.Metadata, 'base64'))]
})
