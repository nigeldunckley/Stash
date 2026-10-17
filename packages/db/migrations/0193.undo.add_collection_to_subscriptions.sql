-- Type: UNDO
-- Name: add_collection_to_subscriptions
-- Description: Lets a YouTube channel belong to a Watch collection (a label)

BEGIN;

ALTER TABLE omnivore.subscriptions DROP COLUMN IF EXISTS collection_id;

COMMIT;
