CREATE TABLE transactions_pending (
  hash TEXT NOT NULL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  from_address TEXT NOT NULL,
  max_priority_fee_per_gas BIGINT NOT NULL,
  nonce INT NOT NULL
);
