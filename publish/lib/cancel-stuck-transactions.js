import * as Sentry from '@sentry/node'
import { StuckTransactionsCanceller } from 'cancel-stuck-transactions'
import ms from 'ms'
import timers from 'node:timers/promises'

const ROUND_LENGTH_MS = ms('20 minutes')
const CHECK_STUCK_TXS_DELAY = ms('1 minute')

export class PendingTransactionsStore {
  #pgClient
  constructor (pgClient) {
    this.#pgClient = pgClient
  }

  async set ({ hash, timestamp, from, maxPriorityFeePerGas, nonce }) {
    await this.#pgClient.query(`
      INSERT INTO transactions_pending (hash, timestamp, from_address, max_priority_fee_per_gas, nonce)
      VALUES ($1, $2, $3, $4, $5)
      `,
    [hash, timestamp, from, maxPriorityFeePerGas, nonce]
    )
  }

  async list () {
    const { rows } = await this.#pgClient.query(`
      SELECT
        hash,
        timestamp,
        from_address as "from",
        max_priority_fee_per_gas as "maxPriorityFeePerGas",
        nonce
      FROM transactions_pending
    `)
    return rows.map(row => ({
      ...row,
      maxPriorityFeePerGas: BigInt(row.maxPriorityFeePerGas)
    }))
  }

  async remove (hash) {
    await this.#pgClient.query(
      'DELETE FROM transactions_pending WHERE hash = $1',
      [hash]
    )
  }
}

export const createStuckTransactionsCanceller = ({ pgClient, signer }) => {
  return new StuckTransactionsCanceller({
    store: new PendingTransactionsStore(pgClient),
    log: str => console.log(str),
    sendTransaction: tx => signer.sendTransaction(tx)
  })
}

export const startCancelStuckTransactions = async stuckTransactionsCanceller => {
  while (true) {
    try {
      const res = await stuckTransactionsCanceller.cancelOlderThan(
        2 * ROUND_LENGTH_MS
      )
      if (res !== undefined) {
        for (const { status, reason } of res) {
          if (status === 'rejected') {
            console.error('Failed to cancel transaction:', reason)
            Sentry.captureException(reason)
          }
        }
      }
    } catch (err) {
      console.error(err)
      if (err.code !== 'FILFOX_REQUEST_FAILED') {
        Sentry.captureException(err)
      }
    }
    await timers.setTimeout(CHECK_STUCK_TXS_DELAY)
  }
}
