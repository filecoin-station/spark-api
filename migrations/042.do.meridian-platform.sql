TRUNCATE TABLE measurements;

ALTER TABLE measurements
  ADD COLUMN data TYPE TEXT
  DROP COLUMN participant_address,
  DROP COLUMN finished_at,
  DROP COLUMN start_at,
  DROP COLUMN status_code,
  DROP COLUMN first_byte_at,
  DROP COLUMN end_at,
  DROP COLUMN byte_length,
  DROP COLUMN timeout,
  DROP COLUMN attestation,
  DROP COLUMN completed_at_round,
  DROP COLUMN spark_version,
  DROP COLUMN zinnia_version,
  DROP COLUMN cid,
  DROP COLUMN provider_address,
  DROP COLUMN protocol,
  DROP COLUMN inet_group,
  DROP COLUMN car_too_large;

CREATE TABLE modules (
  id SERIAL NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  contract_address TEXT NOT NULL
);
INSERT INTO modules (name, slug, contract_address) VALUES ('SPARK', 'spark', '0x8460766edc62b525fc1fa4d628fc79229dc73031');
INSERT INTO modules (name, slug, contract_address) VALUES ('Voyager', 'voyager', '0xc524b83bf85021e674a7c9f18f5381179fabaf6c');
