-- bigint uses 64 bits, the upper limit is +9223372036854775807
-- Postgres and SQL do not support unsigned integers
ALTER TABLE retrievals ADD COLUMN created_at_round BIGINT;
ALTER TABLE retrievals ADD COLUMN created_from_address INET;

UPDATE retrievals SET created_at_round = 0, created_from_address = '0.0.0.0';
ALTER TABLE retrievals ALTER COLUMN created_at_round SET NOT NULL;
ALTER TABLE retrievals ALTER COLUMN created_from_address SET NOT NULL;

ALTER TABLE retrieval_results ADD COLUMN completed_at_round BIGINT;
ALTER TABLE retrieval_results ADD COLUMN completed_from_address INET;

UPDATE retrieval_results SET completed_at_round = 0, completed_from_address = '0.0.0.0';
ALTER TABLE retrieval_results ALTER COLUMN completed_at_round SET NOT NULL;
ALTER TABLE retrieval_results ALTER COLUMN completed_from_address SET NOT NULL;
