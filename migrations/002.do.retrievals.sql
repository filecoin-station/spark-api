CREATE TYPE protocol AS ENUM ('bitswap', 'graphsync');
CREATE TABLE retrieval_templates (
  id SERIAL NOT NULL PRIMARY KEY,
  cid VARCHAR(64) NOT NULL,
  provider_address VARCHAR(64) NOT NULL,
  protocol protocol NOT NULL
);
CREATE TABLE retrievals (
  id SERIAL NOT NULL PRIMARY KEY,
  retrieval_template_id INTEGER NOT NULL REFERENCES retrieval_templates(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO retrieval_templates (
  cid,
  provider_address,
  protocol
) VALUES (
  'bafybeigvgzoolc3drupxhlevdp2ugqcrbcsqfmcek2zxiw5wctk3xjpjwy',
  '/ip4/112.216.168.43/tcp/8999',
  'graphsync'
), (
  'QmcRD4wkPPi6dig81r5sLj9Zm1gDCL4zgpEj9CfuRrGbzF',
  '/ip4/195.26.70.31/tcp/24001',
  'graphsync'
);
