import http from 'node:http'
import { once } from 'node:events'
import { createHandler } from '../index.js'
import pg from 'pg'
import Sentry from '@sentry/node'
import fs from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const client = new pg.Client({ connectionString: DATABASE_URL })
await client.connect()
const handler = await createHandler(client)
const server = http.createServer(handler)
server.listen(PORT)
await once(server, 'listening')
console.log(`http://localhost:${PORT}`)
