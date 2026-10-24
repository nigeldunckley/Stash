-- Type: UNDO
-- Name: youtube_shorts
-- Description: Marks YouTube Shorts so Watch can hide the ones channels bring in
BEGIN;
ALTER TABLE omnivore.library_item DROP COLUMN IF EXISTS youtube_short;
COMMIT;
