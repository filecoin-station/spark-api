import http from 'node:http'
import { once } from 'node:events'
import { createHandler } from '../index.js'
import pg from 'pg'
import Sentry from '@sentry/node'
import fs from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRoundGetter } from '../lib/round-tracker.js'
import { migrate } from '../lib/migrate.js'
import assert from 'node:assert'

const {
  PORT = 8080,
  HOST = '127.0.0.1',
  DOMAIN = 'localhost',
  DATABASE_URL,
  SENTRY_ENVIRONMENT = 'development',
  REQUEST_LOGGING = 'true'
} = process.env

const pkg = JSON.parse(
  await fs.readFile(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json'
    ),
    'utf8'
  )
)

Sentry.init({
  dsn: 'https://4a55431b256641f98f6a51651526831f@o1408530.ingest.sentry.io/4505199717122048',
  release: pkg.version,
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1
})

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

await client.connect()
client.on('error', err => {
  // Prevent crashing the process on idle client errors, the pool will recover
  // itself. If all connections are lost, the process will still crash.
  // https://github.com/brianc/node-postgres/issues/1324#issuecomment-308778405
  console.error('An idle client has experienced an error', err.stack)
})
await migrate(client)

const getCurrentRound = await createRoundGetter(client)

const round = getCurrentRound()
assert(!!round, 'cannot obtain the current Spark round number')
console.log('SPARK round number at service startup:', round.sparkRoundNumber)

const logger = {
  error: console.error,
  info: console.info,
  request: ['1', 'true'].includes(REQUEST_LOGGING) ? console.info : () => {}
}

const handler = await createHandler({
  client,
  logger,
  getCurrentRound,
  domain: DOMAIN
})
const server = http.createServer(handler)
console.log('Starting the http server on host %j port %s', HOST, PORT)
server.listen(PORT, HOST)
await once(server, 'listening')
console.log(`http://${HOST}:${PORT}`)
