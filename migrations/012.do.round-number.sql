-- bigint uses 64 bits, the upper limit is +9223372036854775807
-- Postgres and SQL do not support unsigned integers
ALTER TABLE retrievals ADD COLUMN created_at_round BIGINT;
UPDATE retrievals SET created_at_round = 0;
ALTER TABLE retrievals ALTER COLUMN created_at_round SET NOT NULL;

ALTER TABLE retrieval_results ADD COLUMN completed_at_round BIGINT;
UPDATE retrieval_results SET completed_at_round = 0;
ALTER TABLE retrieval_results ALTER COLUMN completed_at_round SET NOT NULL;
