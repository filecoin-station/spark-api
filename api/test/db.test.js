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
    await client.query('DELETE FROM eligible_deals WHERE payload_cid = $1', [DUMMY_CID])

    await client.query(`
      INSERT INTO eligible_deals
        (miner_id, client_id, piece_cid, piece_size, payload_cid, expires_at)
      VALUES
        ($1, 'f099', $3, 256, $4, $5),
        ($2, 'f099', $3, 256, $4, $5)
    `, [
      'f010',
      'f020',
      'baga12345',
      DUMMY_CID,
      new Date()
    ])
  })
})
