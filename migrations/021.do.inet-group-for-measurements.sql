-- Store the value as text instead of a network datatype.
-- (See https://www.postgresql.org/docs/current/datatype-net-types.html)
-- For privacy reasons, we are hiding the real IP addresses and storing random identifiers instead
ALTER TABLE measurements ADD COLUMN inet_group TEXT;

CREATE TABLE inet_groups (
  id TEXT NOT NULL PRIMARY KEY,
  subnet CIDR NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX inet_groups_created_at ON inet_groups (created_at);
