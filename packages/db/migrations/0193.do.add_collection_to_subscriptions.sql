-- Type: DO
-- Name: add_collection_to_subscriptions
-- Description: Lets a YouTube channel belong to a Watch collection (a label)

BEGIN;

ALTER TABLE omnivore.subscriptions
  ADD COLUMN collection_id uuid REFERENCES omnivore.labels(id) ON DELETE SET NULL;

CREATE INDEX subscriptions_collection_id_idx ON omnivore.subscriptions (collection_id);

COMMIT;
