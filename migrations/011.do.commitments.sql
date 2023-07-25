CREATE TABLE commitments (
  id SERIAL NOT NULL PRIMARY KEY,
  tree TEXT NOT NULL
);
ALTER TABLE retrieval_results
  ADD COLUMN commitment_id INTEGER,
  ADD FOREIGN KEY (commitment_id) REFERENCES commitments(id);
