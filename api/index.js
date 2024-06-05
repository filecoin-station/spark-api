import { json } from 'http-responders'
import * as Sentry from '@sentry/node'
import getRawBody from 'raw-body'
import assert from 'http-assert'
import { validate } from './lib/validate.js'
import { mapRequestToInetGroup, logNetworkInfo } from './lib/network-management.js'
import { satisfies } from 'compare-versions'
import { ethAddressFromDelegated } from '@glif/filecoin-address'

const handler = async (req, res, client, domain) => {
  if (req.headers.host.split(':')[0] !== domain) {
    return redirect(res, `https://${domain}${req.url}`)
  }
  const segs = req.url.split('/').filter(Boolean)
  if (segs[0] === 'retrievals' && req.method === 'POST') {
    assert.fail(410, 'OUTDATED CLIENT')
  } else if (segs[0] === 'retrievals' && req.method === 'PATCH') {
    assert.fail(410, 'OUTDATED CLIENT')
  } else if (segs[0] === 'retrievals' && req.method === 'GET') {
    assert.fail(410, 'This API endpoint is no longer supported.')
  } else if (segs[0] === 'measurements' && req.method === 'POST') {
    await createMeasurement(req, res, client)
  } else if (segs[0] === 'measurements' && req.method === 'GET') {
    await getMeasurement(req, res, client, Number(segs[1]))
  } else if (segs[0] === 'rounds' && segs[1] === 'meridian' && req.method === 'GET') {
    await getMeridianRoundDetails(req, res, client, segs[2], segs[3])
  } else if (segs[0] === 'rounds' && req.method === 'GET') {
    await getRoundDetails(req, res, client, segs[1])
  } else if (segs[0] === 'inspect-request' && req.method === 'GET') {
    await inspectRequest(req, res)
  } else {
    notFound(res)
  }
}

const createMeasurement = async (req, res, client) => {
  const body = await getRawBody(req, { limit: '100kb' })
  const measurement = JSON.parse(body)
  validate(measurement, 'sparkVersion', { type: 'string', required: false })
  validate(measurement, 'zinniaVersion', { type: 'string', required: false })
  assert(
    typeof measurement.sparkVersion === 'string' && satisfies(measurement.sparkVersion, '>=1.9.0'),
    410, 'OUTDATED CLIENT'
  )

  // Backwards-compatibility with older clients sending walletAddress instead of participantAddress
  // We can remove this after enough SPARK clients are running the new version (mid-October 2023)
  if (!('participantAddress' in measurement) && ('walletAddress' in measurement)) {
    validate(measurement, 'walletAddress', { type: 'string', required: true })
    measurement.participantAddress = measurement.walletAddress
    delete measurement.walletAddress
  }
  if (typeof measurement.participantAddress === 'string' && measurement.participantAddress.startsWith('f4')) {
    try {
      measurement.participantAddress = ethAddressFromDelegated(measurement.participantAddress)
    } catch (err) {
      assert.fail(400, 'Invalid .participantAddress - doesn\'t convert to 0x address')
    }
  }

  validate(measurement, 'cid', { type: 'string', required: true })
  validate(measurement, 'providerAddress', { type: 'string', required: false })
  validate(measurement, 'protocol', { type: 'string', required: false })
  validate(measurement, 'participantAddress', { type: 'ethereum address', required: true })
  validate(measurement, 'timeout', { type: 'boolean', required: false })
  validate(measurement, 'startAt', { type: 'date', required: true })
  validate(measurement, 'statusCode', { type: 'number', required: false })
  validate(measurement, 'firstByteAt', { type: 'date', required: false })
  validate(measurement, 'endAt', { type: 'date', required: false })
  validate(measurement, 'byteLength', { type: 'number', required: false })
  validate(measurement, 'attestation', { type: 'string', required: false })
  validate(measurement, 'carTooLarge', { type: 'boolean', required: false })
  validate(measurement, 'carChecksum', { type: 'string', required: false })
  validate(measurement, 'indexerResult', { type: 'string', required: false })
  validate(measurement, 'minerId', { type: 'string', required: false })
  validate(measurement, 'providerId', { type: 'string', required: false })
  validate(measurement, 'stationId', { type: 'string', required: true })
  assert(measurement.stationId.match(/^[0-9a-fA-F]{88}$/), 400, 'Invalid Station ID')

  const inetGroup = await mapRequestToInetGroup(client, req)
  logNetworkInfo(client, req, measurement.stationId, inetGroup)

  const { rows } = await client.query(`
      INSERT INTO measurements (
        spark_version,
        zinnia_version,
        cid,
        provider_address,
        protocol,
        participant_address,
        station_id,
        timeout,
        start_at,
        status_code,
        first_byte_at,
        end_at,
        byte_length,
        attestation,
        inet_group,
        car_too_large,
        car_checksum,
        indexer_result,
        miner_id,
        provider_id,
        completed_at_round
      )
      SELECT
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        id as completed_at_round
      FROM spark_rounds
      ORDER BY id DESC
      LIMIT 1
      RETURNING id
    `, [
    measurement.sparkVersion,
    measurement.zinniaVersion,
    measurement.cid,
    measurement.providerAddress,
    measurement.protocol,
    measurement.participantAddress,
    measurement.stationId,
    measurement.timeout || false,
    parseOptionalDate(measurement.startAt),
    measurement.statusCode,
    parseOptionalDate(measurement.firstByteAt),
    parseOptionalDate(measurement.endAt),
    measurement.byteLength,
    measurement.attestation,
    inetGroup,
    measurement.carTooLarge ?? false,
    measurement.carChecksum,
    measurement.indexerResult,
    measurement.minerId,
    measurement.providerId
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
    minerId: resultRow.miner_id,
    providerId: resultRow.provider_id,
    indexerResult: resultRow.indexer_result,
    providerAddress: resultRow.provider_address,
    stationId: resultRow.station_id,
    protocol: resultRow.protocol,
    sparkVersion: resultRow.spark_version,
    zinniaVersion: resultRow.zinnia_version,
    createdAt: resultRow.created_at,
    finishedAt: resultRow.finished_at,
    timeout: resultRow.timeout,
    startAt: resultRow.start_at,
    statusCode: resultRow.status_code,
    firstByteAt: resultRow.first_byte_at,
    endAt: resultRow.end_at,
    byteLength: resultRow.byte_length,
    carTooLarge: resultRow.car_too_large,
    attestation: resultRow.attestation
  })
}

const getRoundDetails = async (req, res, client, roundParam) => {
  if (roundParam === 'current') {
    const { rows: [round] } = await client.query(`
      SELECT meridian_address, meridian_round FROM spark_rounds
      ORDER BY id DESC
      LIMIT 1
    `)
    assert(!!round, 'No rounds found in "spark_rounds" table.')
    const meridianContractAddress = round.meridian_address
    const meridianRoundIndex = BigInt(round.meridian_round)
    const addr = encodeURIComponent(meridianContractAddress)
    const idx = encodeURIComponent(meridianRoundIndex)
    const location = `/rounds/meridian/${addr}/${idx}`
    res.setHeader('location', location)

    // Cache the location of the current round for a short time to ensure clients learn quickly
    // about a new round when it starts. Also, this endpoint is cheap to execute, so we can
    // afford to call it frequently
    res.setHeader('cache-control', 'max-age=1')

    // Temporary redirect, see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/302
    res.statusCode = 302
    res.end(location)

    return
  }

  // TODO(bajtos) Remove this branch and return 404
  const roundNumber = parseRoundNumber(roundParam)
  await replyWithDetailsForRoundNumber(res, client, roundNumber)
}

const replyWithDetailsForRoundNumber = async (res, client, roundNumber) => {
  const { rows: [round] } = await client.query('SELECT * FROM spark_rounds WHERE id = $1', [roundNumber])
  if (!round) {
    return notFound(res)
  }

  const { rows: tasks } = await client.query('SELECT * FROM retrieval_tasks WHERE round_id = $1', [round.id])

  json(res, {
    roundId: round.id.toString(),
    maxTasksPerNode: round.max_tasks_per_node,
    retrievalTasks: tasks.map(t => ({
      cid: t.cid,
      providerAddress: t.provider_address,
      protocol: t.protocol
    }))
  })
}

const ONE_YEAR_IN_SECONDS = 365 * 24 * 3600

const getMeridianRoundDetails = async (_req, res, client, meridianAddress, meridianRound) => {
  meridianRound = BigInt(meridianRound)

  const { rows: [round] } = await client.query(`
    SELECT * FROM spark_rounds
    WHERE meridian_address = $1 and meridian_round = $2
    `, [
    meridianAddress,
    meridianRound
  ])
  if (!round) {
    // IMPORTANT: This response must not be cached for too long to handle the case when the client
    // requested details of a future round.
    res.setHeader('cache-control', 'max-age=60')
    return notFound(res)
  }

  const { rows: tasks } = await client.query('SELECT * FROM retrieval_tasks WHERE round_id = $1', [round.id])

  res.setHeader('cache-control', `public, max-age=${ONE_YEAR_IN_SECONDS}, immutable`)
  json(res, {
    roundId: round.id.toString(),
    startEpoch: round.start_epoch,
    maxTasksPerNode: round.max_tasks_per_node,
    retrievalTasks: tasks.map(t => ({
      cid: t.cid,
      minerId: t.miner_id,
      // We are preserving these fields to make older rounds still verifiable
      providerAddress: fixNullToUndefined(t.provider_address),
      protocol: fixNullToUndefined(t.protocol)
    }))
  })
}

const fixNullToUndefined = (valueOrNull) => valueOrNull === null ? undefined : valueOrNull

const parseRoundNumber = (roundParam) => {
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

  if (res.statusCode >= 500) {
    Sentry.captureException(err)
  }
}

const notFound = (res) => {
  res.statusCode = 404
  res.end('Not Found')
}

const redirect = (res, location) => {
  res.statusCode = 301
  res.setHeader('location', location)
  res.end()
}

export const inspectRequest = async (req, res) => {
  await json(res, {
    remoteAddress: req.socket.remoteAddress,
    flyClientAddr: req.headers['fly-client-ip'],
    cloudflareAddr: req.headers['cf-connecting-ip'],
    forwardedFor: req.headers['x-forwarded-for'],
    headers: req.headersDistinct
  })
}

export const createHandler = async ({
  client,
  logger,
  domain
}) => {
  return (req, res) => {
    const start = new Date()
    logger.request(`${req.method} ${req.url} ...`)
    handler(req, res, client, domain)
      .catch(err => errorHandler(res, err, logger))
      .then(() => {
        logger.request(`${req.method} ${req.url} ${res.statusCode} (${new Date() - start}ms)`)
      })
  }
}

/**
 * Parse a date string field that may be `undefined` or `null`.
 *
 * - undefined -> undefined
 * - null -> undefined
 * - "iso-date-string" -> new Date("iso-date-string")
 *
 * @param {string | null | undefined} str
 * @returns {Date | undefined}
 */
const parseOptionalDate = (str) => {
  if (str === undefined || str === null) return undefined
  return new Date(str)
}
