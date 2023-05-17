import { json } from 'http-responders'
import { migrate } from './lib/migrate.js'
import getRawBody from 'raw-body'

export const createHandler = async (client) => {
  await migrate(client)

  const handler = async (req, res) => {
    const segs = req.url.split('/').filter(Boolean)
    if (segs[0] === 'retrieval' && req.method === 'POST') {
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
    } else if (segs[0] === 'retrieval' && req.method === 'PATCH') {
      const retrievalId = Number(segs[1])
      const body = await getRawBody(req, { limit: '100kb' })
      const { success } = JSON.parse(body)
      await client.query(`
        UPDATE retrievals
        SET finished_at = NOW(),
            success = $1
        WHERE id = $2
      `, [
        success,
        retrievalId
      ])
      res.end('OK')
    } else {
      res.end('Hello World!')
    }
  }

  return (req, res) => {
    handler(req, res).catch((err) => {
      console.error(err)
      res.statusCode = 500
      res.end('Internal Server Error')
    })
  }
}
