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

const validate = (obj, key, type) => {
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
  validate(result, 'walletAddress', 'string')
  validate(result, 'success', 'boolean')
  validate(result, 'startAt', 'date')
  validate(result, 'statusCode', 'number')
  validate(result, 'firstByteAt', 'date')
  validate(result, 'endAt', 'date')
  validate(result, 'byteLength', 'number')
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
    } else if (err.constraint === 'retrieval_results_retrieval_id_key') {
      assert.fail(409, 'Retrieval Already Completed')
    } else {
      throw err
    }
  }
  res.end('OK')
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
