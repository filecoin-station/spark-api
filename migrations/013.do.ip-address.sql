ALTER TABLE retrievals ADD COLUMN created_from_address INET;
UPDATE retrievals SET created_from_address = '0.0.0.0';
ALTER TABLE retrievals ALTER COLUMN created_from_address SET NOT NULL;

ALTER TABLE retrieval_results ADD COLUMN completed_from_address INET;
UPDATE retrieval_results SET completed_from_address = '0.0.0.0';
ALTER TABLE retrieval_results ALTER COLUMN completed_from_address SET NOT NULL;
