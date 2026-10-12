-- Type: DO
-- Name: add_feed_suggestion_blogrolls
-- Description: The sites each of your feeds lists in its blogroll, and when it was last looked at

BEGIN;

ALTER TABLE omnivore.feed_suggestion_guides
    ADD COLUMN blogroll JSONB,
    ADD COLUMN blogroll_checked_at TIMESTAMPTZ;

COMMIT;
