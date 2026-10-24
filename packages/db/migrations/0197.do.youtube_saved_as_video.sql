-- Type: DO
-- Name: youtube_saved_as_video
-- Description: Moves YouTube videos saved by link from Read to Watch
BEGIN;
-- Saving a video can land on YouTube's cookie consent page, which kept the
-- consent address as the item's link. Point those back at the video, unless
-- the reader already has that video saved.
UPDATE omnivore.library_item li
  SET original_url = 'https://www.youtube.com/watch?v=' ||
        substring(li.original_url from 'v%3D([A-Za-z0-9_-]{11})'),
      youtube_metadata_at = NULL
  WHERE li.original_url ~ '^https?://consent\.youtube\.com/'
    AND li.original_url ~ 'v%3D[A-Za-z0-9_-]{11}'
    AND NOT EXISTS (
      SELECT 1 FROM omnivore.library_item other
      WHERE other.user_id = li.user_id
        AND other.original_url = 'https://www.youtube.com/watch?v=' ||
          substring(li.original_url from 'v%3D([A-Za-z0-9_-]{11})')
    );

-- Read lists everything that isn't a video, so a YouTube video saved as an
-- article showed there instead of in Watch.
UPDATE omnivore.library_item
  SET item_type = 'VIDEO'
  WHERE item_type <> 'VIDEO'
    AND original_url ~ '^https?://((www|m)\.)?(youtube\.com/(watch\?([^#]*&)?v=|shorts/|live/|embed/|v/)|youtu\.be/)[A-Za-z0-9_-]{11}';
COMMIT;
