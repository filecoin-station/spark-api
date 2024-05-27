ALTER TABLE retrievable_deals DROP CONSTRAINT retrievable_deals_pkey;

ALTER TABLE retrievable_deals ADD PRIMARY KEY (cid, miner_id);
