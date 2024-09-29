ALTER TABLE transactions_pending ADD COLUMN gas_limit BIGINT;
UPDATE transactions_pending SET gas_limit = 0;
ALTER TABLE transactions_pending ALTER COLUMN gas_limit SET NOT NULL;
