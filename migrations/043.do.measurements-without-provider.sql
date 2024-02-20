ALTER TABLE measurements
ALTER COLUMN provider_address DROP NOT NULL;

ALTER TABLE measurements
ALTER COLUMN protocol DROP NOT NULL;
