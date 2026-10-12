-- Type: UNDO
-- Name: add_feed_suggestions
-- Description: Feeds Stash suggests from what you read, and how much each of your feeds is trusted as a guide

BEGIN;

DROP TABLE IF EXISTS omnivore.feed_suggestion_guides;
DROP TABLE IF EXISTS omnivore.feed_suggestions;

COMMIT;
