ALTER TABLE commitments
  DROP CONSTRAINT commitments_pkey,
  ADD PRIMARY KEY (cid, published_at);
