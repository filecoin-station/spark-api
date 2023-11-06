import pg from 'pg'

const { DATABASE_URL } = process.env

const client = new pg.Client({ connectionString: DATABASE_URL })
await client.connect()

const notFound = (templateId) =>
  `DELETE FROM retrieval_templates WHERE id = ${templateId};`

const findProviderResult = (template, body) => {
  for (const multiHashResult of body.MultihashResults) {
    for (const providerResult of multiHashResult.ProviderResults) {
      if (providerResult.Provider.Addrs.includes(template.provider_address)) {
        return providerResult
      }
    }
  }
}

const {
  rows: retrievalTemplates
} = await client.query('SELECT * FROM retrieval_templates')
for (const template of retrievalTemplates) {
  const res = await fetch(`https://cid.contact/cid/${template.cid}`)
  if (res.status === 404) {
    console.log(notFound(template.id))
  } else if (res.ok) {
    const body = await res.json()
    const providerResult = findProviderResult(template, body)
    if (providerResult) {
      console.log(
        `UPDATE retrieval_templates SET provider_address = '${template.provider_address}/p2p/${providerResult.Provider.ID}' WHERE id = ${template.id};`
      )
    } else {
      console.log(notFound(template.id))
    }
  } else {
    throw new Error(`${res.status}: ${await res.text()}`)
  }
}
await client.end()
