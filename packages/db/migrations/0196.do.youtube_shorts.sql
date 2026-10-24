-- Type: DO
-- Name: youtube_shorts
-- Description: Marks YouTube Shorts so Watch can hide the ones channels bring in
BEGIN;
ALTER TABLE omnivore.library_item ADD COLUMN youtube_short boolean;
-- Videos saved from /shorts/ links are Shorts; the rest are checked with
-- YouTube's metadata by the API's YouTube maintenance job.
UPDATE omnivore.library_item SET youtube_short = true
  WHERE original_url ~ '^https?://(www\.|m\.)?youtube\.com/shorts/';
COMMIT;
