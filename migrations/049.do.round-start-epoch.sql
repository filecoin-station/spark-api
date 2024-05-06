ALTER TABLE spark_rounds
ADD COLUMN start_epoch BIGINT;

UPDATE spark_rounds SET start_epoch = 0;

ALTER TABLE spark_rounds
ALTER COLUMN start_epoch SET NOT NULL;
