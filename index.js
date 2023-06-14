import { json } from 'http-responders'
import { migrate } from './lib/migrate.js'
import getRawBody from 'raw-body'
import assert from 'http-assert'

const handler = async (req, res, client) => {
  const segs = req.url.split('/').filter(Boolean)
  if (segs[0] === 'retrievals' && req.method === 'POST') {
    await createRetrieval(res, client)
  } else if (segs[0] === 'retrievals' && req.method === 'PATCH') {
    await setRetrievalResult(req, res, client, Number(segs[1]))
  } else if (segs[0] === 'retrievals' && req.method === 'GET') {
    await getRetrieval(req, res, client, Number(segs[1]))
  } else {
    res.end('Hello World!')
  }
}

const createRetrieval = async (res, client) => {
  // TODO: Consolidate to one query
  const { rows: [retrievalTemplate] } = await client.query(`
    SELECT id, cid, provider_address, peer_id, protocol
    FROM retrieval_templates
    WHERE enabled = TRUE
    OFFSET floor(random() * (SELECT COUNT(*) FROM retrieval_templates WHERE enabled = TRUE))
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
    peerID: retrievalTemplate.peer_id,
    protocol: retrievalTemplate.protocol
  })
}

const validate = (obj, key, { type, required }) => {
  if (!required && (!Object.keys(obj).includes(key) || obj[key] === null)) {
    return
  }
  if (type === 'date') {
    const date = new Date(obj[key])
    assert(!isNaN(date.getTime()), 400, `Invalid .${key}`)
  } else {
    assert.strictEqual(typeof obj[key], type, 400, `Invalid .${key}`)
  }
}

const setRetrievalResult = async (req, res, client, retrievalId) => {
  assert(!Number.isNaN(retrievalId), 400, 'Invalid Retrieval ID')
  const body = await getRawBody(req, { limit: '100kb' })
  const result = JSON.parse(body)
  validate(result, 'walletAddress', { type: 'string', required: true })
  validate(result, 'success', { type: 'boolean', required: true })
  validate(result, 'startAt', { type: 'date', required: true })
  validate(result, 'statusCode', { type: 'number', required: false })
  validate(result, 'firstByteAt', { type: 'date', required: false })
  validate(result, 'endAt', { type: 'date', required: false })
  validate(result, 'byteLength', { type: 'number', required: false })
  try {
    await client.query(`
      INSERT INTO retrieval_results (
        retrieval_id, wallet_address, success, start_at, status_code,
        first_byte_at, end_at, byte_length
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8
      )
    `, [
      retrievalId,
      result.walletAddress,
      result.success,
      new Date(result.startAt),
      result.statusCode,
      new Date(result.firstByteAt),
      new Date(result.endAt),
      result.byteLength
    ])
  } catch (err) {
    if (err.constraint === 'retrieval_results_retrieval_id_fkey') {
      assert.fail(404, 'Retrieval Not Found')
    } else if (err.constraint === 'retrieval_results_pkey') {
      assert.fail(409, 'Retrieval Already Completed')
    } else {
      throw err
    }
  }
  res.end('OK')
}

const getRetrieval = async (req, res, client, retrievalId) => {
  assert(!Number.isNaN(retrievalId), 400, 'Invalid Retrieval ID')
  const { rows: [retrievalRow] } = await client.query(`
    SELECT r.id, r.created_at, rr.finished_at, rr.success, rr.start_at,
    rr.status_code, rr.first_byte_at, rr.end_at, rr.byte_length, rt.cid,
    rt.provider_address, rt.peer_id, rt.protocol
    FROM retrievals r
    JOIN retrieval_templates rt ON r.retrieval_template_id = rt.id
    LEFT JOIN retrieval_results rr ON r.id = rr.retrieval_id
    WHERE r.id = $1
  `, [
    retrievalId
  ])
  assert(retrievalRow, 404, 'Retrieval Not Found')
  json(res, {
    id: retrievalRow.id,
    cid: retrievalRow.cid,
    providerAddress: retrievalRow.provider_address,
    peerID: retrievalRow.peer_id,
    protocol: retrievalRow.protocol,
    createdAt: retrievalRow.created_at,
    finishedAt: retrievalRow.finished_at,
    success: retrievalRow.success,
    startAt: retrievalRow.start_at,
    statusCode: retrievalRow.status_code,
    firstByteAt: retrievalRow.first_byte_at,
    endAt: retrievalRow.end_at,
    byteLength: retrievalRow.byte_length
  })
}

const errorHandler = (res, err, logger) => {
  logger.error(err)
  if (err instanceof SyntaxError) {
    res.statusCode = 400
    res.end('Invalid JSON Body')
  } else if (err.statusCode) {
    res.statusCode = err.statusCode
    res.end(err.message)
  } else {
    res.statusCode = 500
    res.end('Internal Server Error')
  }
}

export const createHandler = async ({ client, logger }) => {
  await migrate(client)
  return (req, res) => {
    logger.info(`${req.method} ${req.url} ...`)
    handler(req, res, client)
      .catch(err => errorHandler(res, err, logger))
      .then(() => logger.info(`${req.method} ${req.url} ${res.statusCode}`))
  }
}
