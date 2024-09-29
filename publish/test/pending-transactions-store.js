import assert from 'node:assert'
import pg from 'pg'
import { PendingTransactionsStore } from '../lib/cancel-stuck-transactions.js'

import { DATABASE_URL } from './test-helpers.js'

describe('PendingTransactionsStore', () => {
  let client

  before(async () => {
    client = new pg.Pool({ connectionString: DATABASE_URL })
  })

  after(async () => {
    await client.end()
  })

  it('stores, lists and removes', async () => {
    await client.query('DELETE FROM transactions_pending')
    const store = new PendingTransactionsStore(client)

    assert.strictEqual((await store.list()).length, 0)

    const transaction = {
      hash: 'hash',
      timestamp: new Date(),
      from: 'from',
      maxPriorityFeePerGas: 10n,
      gasLimit: 1n,
      nonce: 123
    }
    await store.set(transaction)

    assert.deepStrictEqual(await store.list(), [transaction])

    assert.rejects(() => store.set({
      ...transaction,
      from: 'overwrite'
    }))
    assert.deepStrictEqual(await store.list(), [transaction])

    await store.remove(transaction.hash)
    assert.strictEqual((await store.list()).length, 0)

    await store.remove(transaction.hash)
    assert.strictEqual((await store.list()).length, 0)
  })
})
