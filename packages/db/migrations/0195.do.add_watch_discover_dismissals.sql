-- Type: DO
-- Name: add_watch_discover_dismissals
-- Description: Videos turned down with "Not for me" on Watch › Discover, so they and their channels are suggested less

BEGIN;

CREATE TABLE omnivore.watch_discover_dismissals (
    user_id UUID NOT NULL REFERENCES omnivore.user(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    channel_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, video_id)
);

CREATE INDEX watch_discover_dismissals_channel_idx ON omnivore.watch_discover_dismissals(user_id, channel_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON omnivore.watch_discover_dismissals TO omnivore_user;

COMMIT;
