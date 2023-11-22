ALTER TABLE spark_rounds
ADD COLUMN meridian_address TEXT;

ALTER TABLE spark_rounds
ADD COLUMN meridian_round BIGINT;

CREATE INDEX spark_rounds_meridian ON spark_rounds(meridian_address, meridian_round);

ALTER TABLE retrieval_tasks
DROP CONSTRAINT retrieval_tasks_round_id_fkey;

ALTER TABLE retrieval_tasks
ADD CONSTRAINT retrieval_tasks_round_id_fkey
FOREIGN KEY (round_id) REFERENCES spark_rounds(id) ON DELETE CASCADE;

