CREATE TABLE meridian_contract_versions (
  -- 0x of f4 address of the MERidian smart contract emitting "round started" events
  -- We are using TEXT instead of BYTEA for simplicity
  contract_address TEXT NOT NULL PRIMARY KEY,
  -- The first SPARK round governed by this smart contract is calculated as
  --   spark_round = meridian_round + spark_round_offset
  -- The offset is usually negative for the first row and positive for other rows
  spark_round_offset BIGINT NOT NULL,
  -- The last SPARK round governed by this smart contract
  last_spark_round_number BIGINT NOT NULL
);

CREATE TABLE spark_rounds (
  -- SPARK round number
  id BIGINT NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL
);
