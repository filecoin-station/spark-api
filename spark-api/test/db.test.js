import pg from 'pg'
import { migrate } from '../../migrations/index.js'

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
  it('can apply migration scripts', async () => {
    await migrate(client)
  })

  it('allows multiple storage deals for the same CID', async () => {
    const DUMMY_CID = 'bafyone'
    await client.query('DELETE FROM retrievable_deals WHERE cid = $1', [DUMMY_CID])

    await client.query(`
      INSERT INTO retrievable_deals (cid, miner_id, expires_at)
      VALUES ($1, $2, $3), ($1, $4, $3)
    `, [
      DUMMY_CID,
      'f010',
      new Date(),
      'f020'
    ])
  })
})
