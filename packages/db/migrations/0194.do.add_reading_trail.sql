-- Type: DO
-- Name: add_reading_trail
-- Description: Which parts of an article were actually read, for the reader's margin map

BEGIN;

ALTER TABLE omnivore.library_item ADD COLUMN reading_trail text;

COMMIT;
