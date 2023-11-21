CREATE INDEX CONCURRENTLY measurements_not_published
ON measurements (published_as)
WHERE published_as IS NULL;
