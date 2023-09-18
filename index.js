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
    // TODO: Deprecate once clients have been updated
    await setRetrievalResult(req, res, client, Number(segs[1]), getCurrentRound)
  } else if (segs[0] === 'retrievals' && req.method === 'GET') {
    assert.fail(501, 'This API endpoint is no longer supported.')
  } else if (segs[0] === 'measurements' && req.method === 'POST') {
    await createMeasurement(req, res, client, getCurrentRound)
  } else if (segs[0] === 'measurements' && req.method === 'GET') {
    await getMeasurement(req, res, client, Number(segs[1]))
  } else if (segs[0] === 'rounds' && req.method === 'GET') {
    await getRoundDetails(req, res, client, getCurrentRound, segs[1])
  } else {
    notFound(res)
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

  const { rows } = await client.query(`
      INSERT INTO measurements (
        spark_version,
        zinnia_version,
        cid,
        provider_address,
        protocol,
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
      SELECT
        retrievals.spark_version,
        retrievals.zinnia_version,
        retrieval_templates.cid,
        retrieval_templates.provider_address,
        retrieval_templates.protocol,
        $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      FROM retrievals LEFT JOIN retrieval_templates
        ON retrievals.retrieval_template_id = retrieval_templates.id
      WHERE retrievals.id = $1
      RETURNING id
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
  if (!rows.length) {
    assert.fail(404, 'Retrieval Not Found')
  }
  json(res, { measurementId: rows[0].id })
}

const createMeasurement = async (req, res, client, getCurrentRound) => {
  const round = await getCurrentRound()
  const body = await getRawBody(req, { limit: '100kb' })
  const measurement = JSON.parse(body)
  validate(measurement, 'sparkVersion', { type: 'string', required: false })
  validate(measurement, 'zinniaVersion', { type: 'string', required: false })
  assert(measurement.sparkVersion, 400, 'OUTDATED CLIENT')

  validate(measurement, 'cid', { type: 'string', required: true })
  validate(measurement, 'providerAddress', { type: 'string', required: true })
  validate(measurement, 'protocol', { type: 'string', required: true })
  validate(measurement, 'walletAddress', { type: 'string', required: true })
  validate(measurement, 'success', { type: 'boolean', required: true })
  validate(measurement, 'timeout', { type: 'boolean', required: false })
  validate(measurement, 'startAt', { type: 'date', required: true })
  validate(measurement, 'statusCode', { type: 'number', required: false })
  validate(measurement, 'firstByteAt', { type: 'date', required: false })
  validate(measurement, 'endAt', { type: 'date', required: false })
  validate(measurement, 'byteLength', { type: 'number', required: false })
  validate(measurement, 'attestation', { type: 'string', required: false })

  const { rows } = await client.query(`
      INSERT INTO measurements (
        spark_version,
        zinnia_version,
        cid,
        provider_address,
        protocol,
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      RETURNING id
    `, [
    measurement.sparkVersion,
    measurement.zinniaVersion,
    measurement.cid,
    measurement.providerAddress,
    measurement.protocol,
    measurement.walletAddress,
    measurement.success,
    measurement.timeout || false,
    new Date(measurement.startAt),
    measurement.statusCode,
    new Date(measurement.firstByteAt),
    new Date(measurement.endAt),
    measurement.byteLength,
    measurement.attestation,
    round
  ])
  json(res, { id: rows[0].id })
}

const getMeasurement = async (req, res, client, measurementId) => {
  assert(!Number.isNaN(measurementId), 400, 'Invalid RetrievalResult ID')
  const { rows: [resultRow] } = await client.query(`
    SELECT *
    FROM measurements
    WHERE id = $1
  `, [
    measurementId
  ])
  assert(resultRow, 404, 'Measurement Not Found')
  json(res, {
    id: resultRow.id,
    cid: resultRow.cid,
    providerAddress: resultRow.provider_address,
    protocol: resultRow.protocol,
    sparkVersion: resultRow.spark_version,
    zinniaVersion: resultRow.zinnia_version,
    createdAt: resultRow.created_at,
    finishedAt: resultRow.finished_at,
    success: resultRow.success,
    timeout: resultRow.timeout,
    startAt: resultRow.start_at,
    statusCode: resultRow.status_code,
    firstByteAt: resultRow.first_byte_at,
    endAt: resultRow.end_at,
    byteLength: resultRow.byte_length,
    attestation: resultRow.attestation,
    publishedAs: resultRow.published_as
  })
}

const getRoundDetails = async (req, res, client, getCurrentRound, roundParam) => {
  const roundNumber = await parseRoundNumberOrCurrent(getCurrentRound, roundParam)

  if (roundParam === 'current') {
    res.setHeader('cache-control', 'no-store')
  }

  const { rows: [round] } = await client.query('SELECT * FROM spark_rounds WHERE id = $1', [roundNumber])
  if (!round) {
    return notFound(res)
  }

  const { rows: tasks } = await client.query('SELECT * FROM retrieval_tasks WHERE round_id = $1', [roundNumber])

  json(res, {
    roundId: roundNumber.toString(),
    retrievalTasks: tasks.map(t => ({
      cid: t.cid,
      providerAddress: t.provider_address,
      protocol: t.protocol
    }))
  })
}

const parseRoundNumberOrCurrent = async (getCurrentRound, roundParam) => {
  if (roundParam === 'current') {
    return await getCurrentRound()
  }
  try {
    return BigInt(roundParam)
  } catch (err) {
    if (err.name === 'SyntaxError') {
      assert.fail(400,
        `Round number must be a valid integer. Actual value: ${JSON.stringify(roundParam)}`
      )
    }
    throw err
  }
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

const notFound = (res) => {
  res.statusCode = 404
  res.end('Not Found')
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
