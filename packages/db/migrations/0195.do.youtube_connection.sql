-- Type: DO
-- Name: youtube_connection
-- Description: Official YouTube connections, source ownership and public metadata
BEGIN;
CREATE TABLE omnivore.youtube_connections (
  user_id uuid PRIMARY KEY REFERENCES omnivore.user(id) ON DELETE CASCADE,
  channel_id text NOT NULL, channel_title text NOT NULL,
  credentials text NOT NULL, generation uuid NOT NULL DEFAULT uuid_generate_v4(),
  synced_at timestamptz, error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE omnivore.youtube_channels (
  channel_id text PRIMARY KEY, data jsonb NOT NULL DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now(), reconciled_at timestamptz,
  lease_expires_at timestamptz, hub_requested_at timestamptz, hub_token text, hub_secret text
);
CREATE TABLE omnivore.youtube_videos (
  video_id text PRIMARY KEY, channel_id text NOT NULL, data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE omnivore.subscriptions
  ADD COLUMN youtube_channel_id text,
  ADD COLUMN youtube_manual_follow boolean NOT NULL DEFAULT true,
  ADD COLUMN youtube_imported boolean NOT NULL DEFAULT false,
  ADD COLUMN youtube_excluded boolean NOT NULL DEFAULT false,
  ADD COLUMN hide_short_videos boolean NOT NULL DEFAULT false,
  ADD COLUMN youtube_initialized_at timestamptz,
  ADD COLUMN youtube_checkpoint_at timestamptz;
UPDATE omnivore.subscriptions SET youtube_channel_id = substring(url from 'channel_id=(UC[A-Za-z0-9_-]{22})')
  WHERE url ~ '^https://www.youtube.com/feeds/videos.xml\?channel_id=UC[A-Za-z0-9_-]{22}$';
CREATE UNIQUE INDEX subscriptions_youtube_identity ON omnivore.subscriptions(user_id, youtube_channel_id) WHERE youtube_channel_id IS NOT NULL;
ALTER TABLE omnivore.library_item
  ADD COLUMN youtube_made_for_kids boolean,
  ADD COLUMN youtube_embeddable boolean,
  ADD COLUMN youtube_available boolean,
  ADD COLUMN youtube_metadata_at timestamptz;
CREATE INDEX youtube_video_refresh ON omnivore.youtube_videos(fetched_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON omnivore.youtube_connections, omnivore.youtube_channels, omnivore.youtube_videos TO omnivore_user;
-- Credentials are never readable through generic API queries. Application operations
-- additionally scope every access by the authenticated user; public caches have no tokens.
ALTER TABLE omnivore.youtube_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY youtube_connection_owner ON omnivore.youtube_connections
  USING (user_id = omnivore.get_current_user_id()) WITH CHECK (user_id = omnivore.get_current_user_id());
COMMIT;
