import varint from 'varint'

const getTopCids = async () => {
  const res = await fetch('https://orchestrator.strn.pl/top-cids')
  const cids = await res.json()
  return cids.map(cid => cid.split('/')[0])
}

const queryIndexProvider = async cid => {
  const res = await fetch(`https://cid.contact/cid/${cid}`)
  if (res.status === 404) return null
  return await res.json()
}

const topCids = await getTopCids()
console.log('INSERT INTO retrieval_templates (cid, provider_address, protocol)')
console.log('VALUES')
let isFirst = true
for (const cid of topCids) {
  try {
    const res = await queryIndexProvider(cid)
    if (!res) {
      continue
    }
    const providerResult = res.MultihashResults[0].ProviderResults[0]
    const protocol = {
      0x900: 'bitswap',
      0x910: 'graphsync',
      4128768: 'graphsync'
    }[varint.decode(Buffer.from(providerResult.Metadata, 'base64'))]
    const providerAddress = providerResult.Provider.Addrs[0]
    if (!protocol || !providerAddress) {
      continue
    }
    if (isFirst) {
      process.stdout.write('  ')
      isFirst = false
    } else {
      process.stdout.write(',\n  ')
    }
    process.stdout.write(`('${cid}', '${providerAddress}', '${protocol}')`)
  } catch (err) {
    console.error('Failed on cid', cid)
    throw err
  }
}
process.stdout.write(';\n')
