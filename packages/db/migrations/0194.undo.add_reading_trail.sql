-- Type: UNDO
-- Name: add_reading_trail
-- Description: Which parts of an article were actually read, for the reader's margin map

BEGIN;

ALTER TABLE omnivore.library_item DROP COLUMN IF EXISTS reading_trail;

COMMIT;
