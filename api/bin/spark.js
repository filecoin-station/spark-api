import '../lib/instrument.js'
import assert from 'node:assert'
import http from 'node:http'
import { once } from 'node:events'
import { createHandler } from '../index.js'
import pg from 'pg'
import { startRoundTracker } from '../lib/round-tracker.js'
import { migrate } from '../../migrations/index.js'
import { clearNetworkInfoStationIdsSeen } from '../lib/network-info-logger.js'
import { recordNetworkInfoTelemetry } from '../../common/telemetry.js'

const {
  PORT = 8080,
  HOST = '127.0.0.1',
  DOMAIN = 'localhost',
  DATABASE_URL,
  DEAL_INGESTER_TOKEN,
  REQUEST_LOGGING = 'true'
} = process.env

// This token is used by other Spark services to authenticate requests adding new deals
// to Spark's database of deals eligible for retrieval testing (`POST /eligible-deals-batch`).
// In production, the value is configured using Fly.io secrets (`fly secrets`).
// The same token is configured in Fly.io secrets for the deal-observer service too.
assert(DEAL_INGESTER_TOKEN, 'DEAL_INGESTER_TOKEN is required')

const client = new pg.Pool({
  connectionString: DATABASE_URL,
  // allow the pool to close all connections and become empty
  min: 0,
  // this values should correlate with service concurrency hard_limit configured in fly.toml
  // and must take into account the connection limit of our PG server, see
  // https://fly.io/docs/postgres/managing/configuration-tuning/
  max: 100,
  // close connections that haven't been used for one second
  idleTimeoutMillis: 1000,
  // automatically close connections older than 60 seconds
  maxLifetimeSeconds: 60
})

client.on('error', err => {
  // Prevent crashing the process on idle client errors, the pool will recover
  // itself. If all connections are lost, the process will still crash.
  // https://github.com/brianc/node-postgres/issues/1324#issuecomment-308778405
  console.error('An idle client has experienced an error', err.stack)
})
await migrate(client)

console.log('Initializing round tracker...')
const start = Date.now()

try {
  const currentRound = await startRoundTracker({
    pgPool: client,
    recordTelemetry: recordNetworkInfoTelemetry
  })
  console.log(
    'Initialized round tracker in %sms. SPARK round number at service startup: %s',
    Date.now() - start,
    currentRound.sparkRoundNumber
  )
} catch (err) {
  console.error('Cannot obtain the current Spark round number:', err)
  process.exit(1)
}

// Clear the station IDs seen by the network info logger every 24 hours
setInterval(clearNetworkInfoStationIdsSeen, 1000 * 60 * 60 * 24)

const logger = {
  error: console.error,
  info: console.info,
  request: ['1', 'true'].includes(REQUEST_LOGGING) ? console.info : () => {}
}

const handler = await createHandler({
  client,
  logger,
  dealIngestionAccessToken: DEAL_INGESTER_TOKEN,
  domain: DOMAIN
})
const server = http.createServer(handler)
console.log('Starting the http server on host %j port %s', HOST, PORT)
server.listen(PORT, HOST)
await once(server, 'listening')
console.log(`http://${HOST}:${PORT}`)
