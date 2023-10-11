ALTER TABLE meridian_contract_versions ADD COLUMN first_spark_round_number BIGINT;

-- Manually set first_spark_round_number for known IE versions
-- as observed in our production deployment on Fly.io
UPDATE meridian_contract_versions
SET first_spark_round_number = 1414
WHERE
  contract_address = '0x3113b83ccec38a18df936f31297de490485d7b2e'
  AND spark_round_offset = 1414;

UPDATE meridian_contract_versions
SET first_spark_round_number = 986
WHERE
  contract_address = '0x381b50e8062757c404dec2bfae4da1b495341af9'
  AND spark_round_offset = 985;

-- For legacy contract versions, set first_spark_round_number to some meaningful value
-- that will not break lookups. We don't expect to look up these old rounds anyways.
UPDATE meridian_contract_versions
SET first_spark_round_number = last_spark_round_number
WHERE first_spark_round_number IS NULL;

ALTER TABLE meridian_contract_versions ALTER COLUMN first_spark_round_number SET NOT NULL;
