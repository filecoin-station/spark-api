DROP TABLE retrievals;

-- Now that we have removed `retrievals` table, we no longer need to preserve deleted retrieval
-- templates.
DELETE FROM retrieval_templates WHERE deleted = true;
ALTER TABLE retrieval_templates DROP COLUMN deleted;
