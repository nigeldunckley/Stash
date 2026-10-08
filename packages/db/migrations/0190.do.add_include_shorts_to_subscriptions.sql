-- Type: DO
-- Name: add_include_shorts_to_subscriptions
-- Description: Lets a YouTube channel subscription choose whether Shorts are saved

BEGIN;

ALTER TABLE omnivore.subscriptions ADD COLUMN include_shorts boolean NOT NULL DEFAULT false;

COMMIT;
