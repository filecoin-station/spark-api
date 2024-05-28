import pg from 'pg'
import { migrate } from '../lib/migrate.js'

const { DATABASE_URL } = process.env

let client

before(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
})

after(async () => {
  await client.end()
})

describe('spark-api database', () => {
  it('can apply all migration scripts', async () => {
    await migrate(client)
  })

  it('allows multiple storage deals for the same CID', async () => {
    await client.query(`
      INSERT INTO retrievable_deals (cid, miner_id, expires_at)
      VALUES ($1, $2, $3), ($1, $4, $3)
    `, [
      'bafyone',
      'f010',
      new Date(),
      'f020'
    ])
  })
})
