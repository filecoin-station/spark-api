TRUNCATE TABLE measurements;

DROP INDEX measurements_not_published;
DROP INDEX measurements_finished_at;

ALTER TABLE measurements
DROP COLUMN published_as;
