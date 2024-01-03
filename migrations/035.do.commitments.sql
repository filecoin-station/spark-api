CREATE TABLE commitments (
  cid TEXT NOT NULL PRIMARY KEY,
  published_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX commitments_published_at ON commitments (published_at);
