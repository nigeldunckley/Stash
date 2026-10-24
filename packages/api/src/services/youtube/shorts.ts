// Settings › Watch › Hide Shorts. It is on unless the account's
// personalization fields say watch.hideShorts is false.

// Leaves out Shorts that channels brought in (folder 'following') while the
// setting is on. Shorts you save yourself still show.
export const HIDE_SHORTS_SQL = `NOT (library_item.youtube_short IS TRUE AND library_item.folder = 'following' AND COALESCE((SELECT up.fields->'watch'->>'hideShorts' FROM omnivore.user_personalization up WHERE up.user_id = library_item.user_id), 'true') <> 'false')`

// A search that asks for is:short (or -is:short) decides for itself.
export const asksForShorts = (query?: string | null) =>
  /\bis:"?short\b/i.test(query ?? '')
