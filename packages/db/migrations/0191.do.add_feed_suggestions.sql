-- Type: DO
-- Name: add_feed_suggestions
-- Description: Feeds Stash suggests from what you read, and how much each of your feeds is trusted as a guide

BEGIN;

CREATE TABLE omnivore.feed_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
    user_id UUID NOT NULL REFERENCES omnivore.user(id) ON DELETE CASCADE,
    site TEXT NOT NULL,
    site_url TEXT NOT NULL,
    feed_url TEXT,
    kind TEXT NOT NULL DEFAULT 'rss',
    title TEXT,
    description TEXT,
    icon TEXT,
    author TEXT,
    posts_per_week REAL,
    last_post_at TIMESTAMPTZ,
    latest JSONB NOT NULL DEFAULT '[]',
    out_hosts TEXT[] NOT NULL DEFAULT '{}',
    signals JSONB NOT NULL DEFAULT '{}',
    reasons JSONB NOT NULL DEFAULT '[]',
    score REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',
    subscription_id UUID,
    trial_ends_at TIMESTAMPTZ,
    checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, site)
);

CREATE INDEX feed_suggestions_user_score_idx ON omnivore.feed_suggestions(user_id, score DESC);

CREATE TABLE omnivore.feed_suggestion_guides (
    user_id UUID NOT NULL REFERENCES omnivore.user(id) ON DELETE CASCADE,
    guide TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, guide)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON omnivore.feed_suggestions TO omnivore_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON omnivore.feed_suggestion_guides TO omnivore_user;

COMMIT;
