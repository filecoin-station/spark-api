-- We must add the new enum value in a standalone transaction. Otherwise the migration fails
-- with the following error:
--   ERROR: unsafe use of new value "http" of enum type protocol
--   HINT:  New enum values must be committed before they can be used.
ALTER TYPE protocol ADD VALUE 'http';
