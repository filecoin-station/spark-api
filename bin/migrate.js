import { migrate } from '../migrations/index.js'
import pg from 'pg'

const { DATABASE_URL } = process.env

const client = new pg.Client({ connectionString: DATABASE_URL })
await client.connect()
await migrate(client)
await client.end()
