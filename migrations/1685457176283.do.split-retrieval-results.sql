CREATE TABLE retrieval_results (
  retrieval_id INTEGER NOT NULL REFERENCES retrievals(id) PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  finished_at TIMESTAMP NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL
);
ALTER TABLE retrievals
  DROP COLUMN wallet_address,
  DROP COLUMN finished_at,
  DROP COLUMN success;
