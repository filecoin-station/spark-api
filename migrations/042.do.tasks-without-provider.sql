ALTER TABLE retrieval_tasks
ALTER COLUMN provider_address DROP NOT NULL;

ALTER TABLE retrieval_tasks
ALTER COLUMN protocol DROP NOT NULL;
