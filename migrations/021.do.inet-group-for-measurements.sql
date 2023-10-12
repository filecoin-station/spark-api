-- Store the value as text instead of a network datatype.
-- (See https://www.postgresql.org/docs/current/datatype-net-types.html)
-- This allow us to easily change the group format in the future, e.g. to obfuscate the real address
ALTER TABLE measurements ADD COLUMN inet_group TEXT;
