import pg from 'pg'

const { DATABASE_URL } = process.env

const client = new pg.Client({ connectionString: DATABASE_URL })
await client.connect()

const {
  rows: retrievalTemplates
} = await client.query('SELECT * FROM retrieval_templates')
for (const template of retrievalTemplates) {
  const res = await fetch(`https://cid.contact/cid/${template.cid}`)
  if (res.status === 404) {
    console.log(`UPDATE retrieval_templates SET peer_id = 'not found', enabled = FALSE WHERE id = ${template.id};`)
  } else if (res.ok) {
    const body = await res.json()
    template.peerID = body.MultihashResults[0].ProviderResults[0].Provider.ID
    console.log(`UPDATE retrieval_templates SET peer_id = '${template.peerID}' WHERE id = ${template.id};`)
  } else {
    throw new Error(`${res.status}: ${await res.text()}`)
  }
}
await client.end()
