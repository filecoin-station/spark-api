ALTER TABLE spark_rounds ADD COLUMN meridian_address TEXT NOT NULL DEFAULT '0x00';
ALTER TABLE spark_rounds ADD COLUMN meridian_round BIGINT NOT NULL DEFAULT 0;
