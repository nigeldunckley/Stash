-- Type: UNDO
-- Name: add_watch_discover_dismissals
-- Description: Videos turned down with "Not for me" on Watch › Discover, so they and their channels are suggested less

BEGIN;

DROP TABLE IF EXISTS omnivore.watch_discover_dismissals;

COMMIT;
