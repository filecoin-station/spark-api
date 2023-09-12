CREATE TABLE retrieval_tasks (
  id SERIAL NOT NULL PRIMARY KEY,
  round_id BIGINT NOT NULL REFERENCES spark_rounds(id),
  cid TEXT NOT NULL,
  provider_address TEXT NOT NULL,
  protocol protocol NOT NULL
  -- Note: we cannot enforce the following uniqueness constraint because retrieval_templates
  -- contain duplicate data.
  -- UNIQUE(round_id, cid, provider_address, protocol)
);

ALTER TABLE spark_rounds ADD COLUMN deadline TIMESTAMPTZ;
