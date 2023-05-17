import http from 'node:http'
import { once } from 'node:events'
import { createHandler } from '../index.js'
import pg from 'pg'

const { PORT = 8080, DATABASE_URL } = process.env

const client = new pg.Pool({ connectionString: DATABASE_URL })
await client.connect()
const handler = await createHandler(client)
const server = http.createServer(handler)
server.listen(PORT)
await once(server, 'listening')
console.log(`http://localhost:${PORT}`)
