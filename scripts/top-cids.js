import varint from 'varint'
import pg from 'pg'

const getTopCids = async (limit = 100) => {
  const res = await fetch(`https://orchestrator.strn.pl/top-cids?limit=${limit}`)
  const urls = await res.json()
  // Remove sub-resource path and query string from the urls
  // Example values from Saturn:
  //   QmYb6LGNZjk1hm1jALnWntxmq8Ha8H6u5a8DKvYgzVp9bW/2.json
  //   bafybeidestig5mff2fzm6t3bft4irrjkkrt3lf5ulveznq3kre2gsbolee?format=car
  return urls.map(cid => cid.split(/[/?]/)[0])
}

const queryIndexProvider = async cid => {
  const res = await fetch(`https://cid.contact/cid/${cid}`)
  if (res.status === 404) return null
  return await res.json()
}

const [,, limit] = process.argv
const topCids = await getTopCids(limit)
for (const cid of topCids) {
  try {
    const res = await queryIndexProvider(cid)
    if (!res) {
      continue
    }
    const providers = res.MultihashResults[0].ProviderResults
    const uniqueEndpoints = new Set()
    for (const providerResult of providers) {
      const protocol = {
        0x900: 'bitswap',
        0x910: 'graphsync',
        0x0920: 'http',
        4128768: 'graphsync'
      }[varint.decode(Buffer.from(providerResult.Metadata, 'base64'))]
      const providerAddress = providerResult.Provider.Addrs[0]
      if (!protocol || !providerAddress) {
        continue
      }

      const endpointKey = [protocol, providerAddress].join('::')
      if (!uniqueEndpoints.has(endpointKey)) {
        const fullAddress = `${providerAddress}/p2p/${providerResult.Provider.ID}`
        console.log(
          'INSERT INTO retrieval_templates (cid, provider_address, protocol) VALUES ' +
            `(${pg.escapeLiteral(cid)}, ${pg.escapeLiteral(fullAddress)}, ${pg.escapeLiteral(protocol)});`
        )
        uniqueEndpoints.add(endpointKey)
      }
    }
  } catch (err) {
    console.error('Failed on cid', cid)
    throw err
  }
}
