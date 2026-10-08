-- Type: UNDO
-- Name: add_include_shorts_to_subscriptions
-- Description: Lets a YouTube channel subscription choose whether Shorts are saved

BEGIN;

ALTER TABLE omnivore.subscriptions DROP COLUMN IF EXISTS include_shorts;

COMMIT;
