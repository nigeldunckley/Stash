-- Type: DO
-- Name: youtube_saved_video_details
-- Description: Fills in YouTube videos saved by link that never got their details
BEGIN;
-- One address per video, as new saves now use: share (youtu.be), mobile,
-- embed and live links become the watch link, unless the reader already has
-- that video saved under it.
WITH ids AS (
  SELECT id, user_id, COALESCE(
      substring(original_url from '^https?://youtu\.be/([A-Za-z0-9_-]{11})'),
      substring(original_url from '^https?://(?:www\.|m\.)?youtube\.com/(?:embed|live|v)/([A-Za-z0-9_-]{11})'),
      substring(original_url from '^https?://(?:www\.|m\.)?youtube\.com/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})')
    ) AS video_id
  FROM omnivore.library_item
  WHERE item_type = 'VIDEO'
    AND original_url ~ '^https?://(youtu\.be/|((www|m)\.)?youtube\.com/(watch|embed/|live/|v/))'
)
UPDATE omnivore.library_item li
  SET original_url = 'https://www.youtube.com/watch?v=' || ids.video_id
  FROM ids
  WHERE li.id = ids.id
    AND ids.video_id IS NOT NULL
    AND li.original_url <> 'https://www.youtube.com/watch?v=' || ids.video_id
    AND NOT EXISTS (
      SELECT 1 FROM omnivore.library_item other
      WHERE other.user_id = ids.user_id
        AND other.original_url = 'https://www.youtube.com/watch?v=' || ids.video_id
    );

-- Videos left waiting on a page fetch that never came (or that got YouTube's
-- consent page): show them as saved, with YouTube's thumbnail, and have the
-- YouTube maintenance job look up their title and channel.
UPDATE omnivore.library_item
  SET state = 'SUCCEEDED'
  WHERE item_type = 'VIDEO'
    AND state IN ('PROCESSING', 'FAILED', 'CONTENT_NOT_FETCHED')
    AND original_url ~ '^https://www\.youtube\.com/(watch\?v=|shorts/)[A-Za-z0-9_-]{11}';

UPDATE omnivore.library_item
  SET thumbnail = 'https://i.ytimg.com/vi/' ||
        substring(original_url from 'v=([A-Za-z0-9_-]{11})') || '/hqdefault.jpg'
  WHERE item_type = 'VIDEO'
    AND thumbnail IS NULL
    AND original_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}';

UPDATE omnivore.library_item
  SET youtube_metadata_at = NULL
  WHERE item_type = 'VIDEO'
    AND original_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}'
    AND (title ~ '^https?://' OR title ILIKE 'Before you continue%');
COMMIT;
