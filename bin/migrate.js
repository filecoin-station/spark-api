import { migrate } from '../lib/migrate.js'
import pg from 'pg'

const { DATABASE_URL } = process.env

const client = new pg.Client({ connectionString: DATABASE_URL })
await migrate(client)
await client.end()
