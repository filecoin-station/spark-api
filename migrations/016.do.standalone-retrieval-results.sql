ALTER TABLE retrieval_results ADD COLUMN spark_version TEXT;
ALTER TABLE retrieval_results ADD COLUMN zinnia_version TEXT;
ALTER TABLE retrieval_results ADD COLUMN cid TEXT;
ALTER TABLE retrieval_results ADD COLUMN provider_address TEXT;
ALTER TABLE retrieval_results ADD COLUMN protocol protocol;

UPDATE retrieval_results
SET
  spark_version = retrievals.spark_version,
  zinnia_version = retrievals.zinnia_version,
  cid = retrieval_templates.cid,
  provider_address = retrieval_templates.provider_address,
  protocol = retrieval_templates.protocol
FROM
  retrievals LEFT JOIN retrieval_templates
    ON retrievals.retrieval_template_id = retrieval_templates.id
WHERE retrieval_id = retrievals.id;

ALTER TABLE retrieval_results ALTER COLUMN cid SET NOT NULL;
ALTER TABLE retrieval_results ALTER COLUMN provider_address SET NOT NULL;
ALTER TABLE retrieval_results ALTER COLUMN protocol SET NOT NULL;

-- Remove the foreign key constraint to decouple `retrieval_results` from `retrievals`
ALTER TABLE retrieval_results DROP CONSTRAINT retrieval_results_retrieval_id_fkey;
-- Rename the column so that it becomes our independent primary key called `id`
ALTER TABLE retrieval_results RENAME COLUMN retrieval_id TO id;
-- Setup autoincrementing for our new PK
-- See https://dba.stackexchange.com/a/78735/125312
ALTER TABLE retrieval_results
   ALTER id ADD GENERATED ALWAYS AS identity;
-- Adjust the sequence to match the current maximum value
SELECT setval(pg_get_serial_sequence('retrieval_results', 'id'), max(id))
FROM retrieval_results;

