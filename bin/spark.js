import http from 'node:http'
import { once } from 'node:events'
import { createHandler } from '../index.js'
import pg from 'pg'
import Sentry from '@sentry/node'
import fs from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPublishLoop } from '../lib/publish.js'

const {
  PORT = 8080,
  DATABASE_URL,
  SENTRY_ENVIRONMMENT = 'development'
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
  environment: SENTRY_ENVIRONMMENT,
  tracesSampleRate: 0.1
})

const client = new pg.Pool({ connectionString: DATABASE_URL })
await client.connect()
client.on('error', err => {
  // Prevent crashing the process on idle client errors, the pool will recover
  // itself. If all connections are lost, the process will still crash.
  // https://github.com/brianc/node-postgres/issues/1324#issuecomment-308778405
  console.error('An idle client has experienced an error', err.stack)
})
const handler = await createHandler({ client, logger: console })
const server = http.createServer(handler)
server.listen(PORT)
await once(server, 'listening')
console.log(`http://localhost:${PORT}`)
await runCommitmentLoop(client)
