import { json } from 'http-responders'
import { migrate } from './lib/migrate.js'
import getRawBody from 'raw-body'
import assert from 'http-assert'

const handler = async (req, res, client) => {
  const segs = req.url.split('/').filter(Boolean)
  if (segs[0] === 'retrievals' && req.method === 'POST') {
    await createRetrieval(res, client)
  } else if (segs[0] === 'retrievals' && req.method === 'PATCH') {
    await updateRetrieval(req, res, client, Number(segs[1]))
  } else if (segs[0] === 'retrievals' && req.method === 'GET') {
    await getRetrieval(req, res, client, Number(segs[1]))
  } else {
    res.end('Hello World!')
  }
}

const createRetrieval = async (res, client) => {
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
}

const updateRetrieval = async (req, res, client, retrievalId) => {
  assert(!Number.isNaN(retrievalId), 400, 'Invalid Retrieval ID')
  const body = await getRawBody(req, { limit: '100kb' })
  const { success, walletAddress } = JSON.parse(body)
  assert.strictEqual(
    typeof success,
    'boolean',
    400,
    'boolean .success required'
  )
  assert.strictEqual(
    typeof walletAddress,
    'string',
    400,
    'string .walletAddress required'
  )
  const { rows } = await client.query(`
    UPDATE retrievals
    SET finished_at = NOW(),
      success = $2,
      wallet_address = $3
    WHERE id = $1 AND success IS NULL
    RETURNING id
  `, [
    retrievalId,
    success,
    walletAddress
  ])
  assert(rows.length > 0, 404, 'Retrieval Not Found')
  res.end('OK')
}

const getRetrieval = async (req, res, client, retrievalId) => {
  assert(!Number.isNaN(retrievalId), 400, 'Invalid Retrieval ID')
  const { rows: [retrievalRow] } = await client.query(`
    SELECT r.id, r.created_at, r.finished_at, r.success, rt.cid,
    rt.provider_address, rt.protocol
    FROM retrievals r
    JOIN retrieval_templates rt ON r.retrieval_template_id = rt.id
    WHERE r.id = $1
  `, [
    retrievalId
  ])
  assert(retrievalRow, 404, 'Retrieval Not Found')
  json(res, {
    id: retrievalRow.id,
    cid: retrievalRow.cid,
    providerAddress: retrievalRow.provider_address,
    protocol: retrievalRow.protocol,
    createdAt: retrievalRow.created_at,
    finishedAt: retrievalRow.finished_at,
    success: retrievalRow.success
  })
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
