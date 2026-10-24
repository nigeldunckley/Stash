-- Type: UNDO
-- Name: youtube_connection
BEGIN;
DROP TABLE omnivore.youtube_videos, omnivore.youtube_channels, omnivore.youtube_connections;
DROP INDEX omnivore.subscriptions_youtube_identity;
ALTER TABLE omnivore.subscriptions DROP COLUMN youtube_channel_id, DROP COLUMN youtube_manual_follow, DROP COLUMN youtube_imported, DROP COLUMN youtube_excluded, DROP COLUMN hide_short_videos, DROP COLUMN youtube_initialized_at, DROP COLUMN youtube_checkpoint_at;
ALTER TABLE omnivore.library_item DROP COLUMN youtube_made_for_kids, DROP COLUMN youtube_embeddable, DROP COLUMN youtube_available, DROP COLUMN youtube_metadata_at;
COMMIT;
