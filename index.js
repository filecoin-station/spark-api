import { json } from 'http-responders'
import { migrate } from './lib/migrate.js'
import getRawBody from 'raw-body'
import assert from 'http-assert'
import { validate } from './lib/validate.js'

const handler = async (req, res, client, getCurrentRound) => {
  const segs = req.url.split('/').filter(Boolean)
  if (segs[0] === 'retrievals' && req.method === 'POST') {
    await createRetrieval(req, res, client, getCurrentRound)
  } else if (segs[0] === 'retrievals' && req.method === 'PATCH') {
    await setRetrievalResult(req, res, client, Number(segs[1]), getCurrentRound)
  } else if (segs[0] === 'retrievals' && req.method === 'GET') {
    await getRetrieval(req, res, client, Number(segs[1]))
  } else {
    res.statusCode = 404
    res.end('Not Found')
  }
}

const createRetrieval = async (req, res, client, getCurrentRound) => {
  const round = await getCurrentRound()
  const body = await getRawBody(req, { limit: '100kb' })
  const meta = body.length > 0 ? JSON.parse(body) : {}
  validate(meta, 'sparkVersion', { type: 'string', required: false })
  validate(meta, 'zinniaVersion', { type: 'string', required: false })
  assert(meta.sparkVersion, 400, 'OUTDATED CLIENT')

  // TODO: Consolidate to one query
  const { rows: [retrievalTemplate] } = await client.query(`
    SELECT id, cid, provider_address, protocol
    FROM retrieval_templates
    WHERE deleted = FALSE
    OFFSET floor(random() * (SELECT COUNT(*) FROM retrieval_templates WHERE deleted = FALSE))
    LIMIT 1
  `)
  const { rows: [retrieval] } = await client.query(`
    INSERT INTO retrievals (
      retrieval_template_id,
      spark_version,
      zinnia_version,
      created_at_round
    )
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [
    retrievalTemplate.id,
    meta.sparkVersion,
    meta.zinniaVersion,
    round
  ])
  json(res, {
    id: retrieval.id,
    cid: retrievalTemplate.cid,
    providerAddress: retrievalTemplate.provider_address,
    protocol: retrievalTemplate.protocol
  })
}

const setRetrievalResult = async (req, res, client, retrievalId, getCurrentRound) => {
  const round = await getCurrentRound()
  assert(!Number.isNaN(retrievalId), 400, 'Invalid Retrieval ID')
  const body = await getRawBody(req, { limit: '100kb' })
  const result = JSON.parse(body)
  validate(result, 'walletAddress', { type: 'string', required: true })
  validate(result, 'success', { type: 'boolean', required: true })
  validate(result, 'timeout', { type: 'boolean', required: false })
  validate(result, 'startAt', { type: 'date', required: true })
  validate(result, 'statusCode', { type: 'number', required: false })
  validate(result, 'firstByteAt', { type: 'date', required: false })
  validate(result, 'endAt', { type: 'date', required: false })
  validate(result, 'byteLength', { type: 'number', required: false })
  validate(result, 'attestation', { type: 'string', required: false })
  try {
    await client.query(`
      INSERT INTO retrieval_results (
        retrieval_id,
        wallet_address,
        success,
        timeout,
        start_at,
        status_code,
        first_byte_at,
        end_at,
        byte_length,
        attestation,
        completed_at_round
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
    `, [
      retrievalId,
      result.walletAddress,
      result.success,
      result.timeout || false,
      new Date(result.startAt),
      result.statusCode,
      new Date(result.firstByteAt),
      new Date(result.endAt),
      result.byteLength,
      result.attestation,
      round
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
    SELECT
      r.id,
      r.created_at,
      r.spark_version,
      r.zinnia_version,
      rr.finished_at,
      rr.success,
      rr.timeout,
      rr.start_at,
      rr.status_code,
      rr.first_byte_at,
      rr.end_at,
      rr.byte_length,
      rr.attestation,
      rt.cid,
      rt.provider_address,
      rt.protocol
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
    protocol: retrievalRow.protocol,
    sparkVersion: retrievalRow.spark_version,
    zinniaVersion: retrievalRow.zinnia_version,
    createdAt: retrievalRow.created_at,
    finishedAt: retrievalRow.finished_at,
    success: retrievalRow.success,
    timeout: retrievalRow.timeout,
    startAt: retrievalRow.start_at,
    statusCode: retrievalRow.status_code,
    firstByteAt: retrievalRow.first_byte_at,
    endAt: retrievalRow.end_at,
    byteLength: retrievalRow.byte_length,
    attestation: retrievalRow.attestation
  })
}

const errorHandler = (res, err, logger) => {
  if (err instanceof SyntaxError) {
    res.statusCode = 400
    res.end('Invalid JSON Body')
  } else if (err.statusCode) {
    res.statusCode = err.statusCode
    res.end(err.message)
  } else {
    logger.error(err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
}

export const createHandler = async ({ client, logger, getCurrentRound }) => {
  await migrate(client)
  return (req, res) => {
    const start = new Date()
    logger.info(`${req.method} ${req.url} ...`)
    handler(req, res, client, getCurrentRound)
      .catch(err => errorHandler(res, err, logger))
      .then(() => {
        logger.info(`${req.method} ${req.url} ${res.statusCode} (${new Date() - start}ms)`)
      })
  }
}
