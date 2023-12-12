ALTER TABLE spark_rounds
ADD COLUMN max_tasks_per_node INT NOT NULL
-- 60 minutes/round * 6 tasks/minute, based on hard-coded delay of 10s between tasks
DEFAULT 360;
