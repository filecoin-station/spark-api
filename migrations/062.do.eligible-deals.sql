# After the seed migration `063.do.eligible-deals-seed.sql`, this table's content will be managed by https://github.com/filecoin-station/fil-deal-ingester
CREATE TABLE eligible_deals (
  miner_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  piece_cid TEXT NOT NULL,
  piece_size BIGINT NOT NULL,
  payload_cid TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,

  sourced_from_f05_state BOOLEAN NOT NULL DEFAULT TRUE,

  PRIMARY KEY (miner_id, client_id, piece_cid, piece_size)
);

CREATE INDEX eligible_deals_miner_id ON eligible_deals (miner_id);
CREATE INDEX eligible_deals_client_id ON eligible_deals (client_id);
