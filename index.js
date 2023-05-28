import { json } from 'http-responders'
import { migrate } from './lib/migrate.js'
import getRawBody from 'raw-body'
import assert from 'http-assert'

const handler = async (req, res, client) => {
  const segs = req.url.split('/').filter(Boolean)
  if (segs[0] === 'retrievals' && req.method === 'POST') {
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
  } else if (segs[0] === 'retrievals' && req.method === 'PATCH') {
    const retrievalId = Number(segs[1])
    assert(!Number.isNaN(retrievalId), 400, 'Invalid Retrieval ID')
    const body = await getRawBody(req, { limit: '100kb' })
    const { success } = JSON.parse(body)
    const { rows } = await client.query(`
      UPDATE retrievals
      SET finished_at = NOW(),
          success = $1
      WHERE id = $2
      RETURNING id
    `, [
      success,
      retrievalId
    ])
    assert(rows.length > 0, 404, 'Retrieval Not Found')
    res.end('OK')
  } else {
    res.end('Hello World!')
  }
}

const errorHandler = (res, err) => {
  if (err instanceof SyntaxError) {
    res.statusCode = 400
    return res.end('Invalid JSON Body')
  } else if (err.statusCode) {
    res.statusCode = err.statusCode
    res.end(err.message)
  } else {
    console.error(err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
}

export const createHandler = async (client) => {
  await migrate(client)
  return (req, res) => {
    handler(req, res, client).catch(err => errorHandler(res, err))
  }
}
