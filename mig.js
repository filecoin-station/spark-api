import pg from 'pg'

/*
Usage:

1. Setup port forwarding between your local computer and Postgres instance hosted by Fly.io
  ([docs](https://fly.io/docs/postgres/connecting/connecting-with-flyctl/)). Remember to use a
  different port if you have a local Postgres server for development!

   ```sh
   fly proxy 5454:5432 -a spark-db
   ```

2. Find spark-db entry in 1Password and get the user and password from the connection string.

3. Run the following command to apply the updates, remember to replace "user" and "password"
   with the real credentials:

   ```sh
   DATABASE_URL="postgres://user:password@localhost:5454/spark" node mig.js
   ```

*/

const { DATABASE_URL } = process.env

const client = new pg.Client({ connectionString: DATABASE_URL })
await client.connect()

while (true) {
  // Step 1: find the oldest commitment (the first commitment that we don't need to backfill)
  const { rows: [{ published_at: end }] } = await client.query(
    'SELECT published_at FROM commitments ORDER BY published_at LIMIT 1'
  )
  console.log('Processing measurements reported before', end)

  // Step 2: backfill commitments for the last hour before "end"
  // Note: we may omit some older measurements belonging to the first commitment found
  // That's ok. When the next run finds a CID already present in the commitments table,
  // the part "ON CONFLICT DO NOTHING" will tell PG to silently ignore the INSERT command.
  const { rows, rowCount } = await client.query(`
  INSERT INTO commitments (cid, published_at)
    SELECT published_as as cid, MAX(finished_at) + INTERVAL '3 minutes' as published_at FROM measurements
    WHERE finished_at >= ($1::TIMESTAMPTZ - INTERVAL '12 hour') AND finished_at <= $1::TIMESTAMPTZ
    GROUP BY published_as
    ORDER BY published_at
  ON CONFLICT DO NOTHING
  RETURNING cid -- I _think_ this helps to get correct row count reported by PG
`, [
    end
  ])

  // See https://node-postgres.com/apis/result#resultrowcount-int--null
  // The property `result.rowCount` does not reflect the number of rows returned from a
  // query. e.g. an update statement could update many rows (so high result.rowCount value) but
  // result.rows.length would be zero.
  // I am not sure which value is the correct one to use, I'll update this code after I run
  // it for the first time.
  console.log('rowCount: %s rows.length: %s', rowCount, rows.length)
  if (rowCount === 0) break
}

await client.end()
