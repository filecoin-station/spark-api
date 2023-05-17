import { json } from 'http-responders'
import { migrate } from './lib/migrate.js'

export const createHandler = async (client) => {
  await migrate(client)

  const handler = async (req, res) => {
    if (req.url === '/retrieval' && req.method === 'PUT') {
      // TODO: Consolidate to one query
      const { rows: [retrievalTemplate] } = await client.query(`
        SELECT id, cid, provider_address, protocol
        FROM retrieval_templates
        OFFSET floor(random() * (SELECT COUNT(*) FROM retrieval_templates))
        LIMIT 1
      `)
      const { rows: [retrieval] } = await client.query(`
        INSERT INTO retrievals (retrieval_template_id)
        VALUES ($1)
        RETURNING id
      `, [
        retrievalTemplate.id
      ])
      json(res, {
        id: retrieval.id,
        cid: retrievalTemplate.cid,
        providerAddress: retrievalTemplate.provider_address,
        protocol: retrievalTemplate.protocol
      })
      return
    }
    res.end('Hello World!')
  }

  return (req, res) => {
    handler(req, res).catch((err) => {
      console.error(err)
      res.statusCode = 500
      res.end('Internal Server Error')
    })
  }
}
