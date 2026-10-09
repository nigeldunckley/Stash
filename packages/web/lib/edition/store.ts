// Loads today's edition, or makes it the first time it is opened after the
// edition hour. Editions are kept with your account (in the personalization
// settings), so the Mac and iPhone show the same one.

import { gql } from 'graphql-request'
import { gqlSearchQuery } from '../networking/library_items/gql'
import type {
  LibraryItemNode,
  LibraryItems,
} from '../networking/library_items/useLibraryItems'
import { gqlFetcher } from '../networking/networkHelpers'
import { Buzz, Edition, buildEdition, editionDateFor } from './engine'

export type EditionState = {
  hour: number
  editions: Edition[]
}

export const DEFAULT_EDITION_HOUR = 6
const KEEP_EDITIONS = 14

type Fields = Record<string, unknown> & { edition?: Partial<EditionState> }

const GQL_GET_FIELDS = gql`
  query EditionFields {
    getUserPersonalization {
      ... on GetUserPersonalizationSuccess {
        userPersonalization {
          fields
        }
      }
      ... on GetUserPersonalizationError {
        errorCodes
      }
    }
  }
`

const GQL_SET_FIELDS = gql`
  mutation SetEditionFields($input: SetUserPersonalizationInput!) {
    setUserPersonalization(input: $input) {
      ... on SetUserPersonalizationSuccess {
        updatedUserPersonalization {
          fields
        }
      }
      ... on SetUserPersonalizationError {
        errorCodes
      }
    }
  }
`

const readFields = async (): Promise<Fields> => {
  const data = (await gqlFetcher(GQL_GET_FIELDS)) as {
    getUserPersonalization?: {
      userPersonalization?: { fields?: Fields | null }
      errorCodes?: string[]
    }
  }
  const fields = data.getUserPersonalization?.userPersonalization?.fields
  return fields && typeof fields === 'object' ? fields : {}
}

const stateOf = (fields: Fields): EditionState => ({
  hour:
    typeof fields.edition?.hour === 'number'
      ? fields.edition.hour
      : DEFAULT_EDITION_HOUR,
  editions: Array.isArray(fields.edition?.editions)
    ? (fields.edition?.editions as Edition[])
    : [],
})

export const loadEditionState = async (): Promise<EditionState> =>
  stateOf(await readFields())

// Changes the saved edition state. Reads the latest copy first so other
// settings kept in the same place are left as they are.
export const updateEditionState = async (
  change: (state: EditionState) => EditionState
): Promise<EditionState> => {
  const fields = await readFields()
  const next = change(stateOf(fields))
  next.editions = next.editions.slice(0, KEEP_EDITIONS)
  const data = (await gqlFetcher(GQL_SET_FIELDS, {
    input: { fields: { ...fields, edition: next } },
  })) as { setUserPersonalization?: { errorCodes?: string[] } }
  if (data.setUserPersonalization?.errorCodes?.length) {
    throw new Error(data.setUserPersonalization.errorCodes[0])
  }
  return next
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10)

// Runs a library search, following pages up to `max` items.
export const searchItems = async (
  query: string,
  max: number
): Promise<LibraryItemNode[]> => {
  const items: LibraryItemNode[] = []
  let after: string | undefined
  while (items.length < max) {
    const data = (await gqlFetcher(gqlSearchQuery(), {
      after,
      first: Math.min(100, max - items.length),
      query,
      includeContent: false,
    })) as { search: LibraryItems }
    if (data.search.errorCodes?.length) {
      throw new Error(data.search.errorCodes[0])
    }
    items.push(...data.search.edges.map((edge) => edge.node))
    if (!data.search.pageInfo.hasNextPage) break
    after = data.search.pageInfo.endCursor
  }
  return items
}

// Points and comments for articles that were posted to Hacker News, the
// best public measure of what is popular. Missing answers are left out.
const hackerNewsBuzz = async (
  items: LibraryItemNode[]
): Promise<Map<string, Buzz>> => {
  const buzz = new Map<string, Buzz>()
  const ask = async (item: LibraryItemNode) => {
    const url = item.originalArticleUrl || item.url
    if (!/^https?:/.test(url) || /news\.ycombinator\.com/.test(url)) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    try {
      const response = await fetch(
        `https://hn.algolia.com/api/v1/search?restrictSearchableAttributes=url&hitsPerPage=3&query=${encodeURIComponent(
          url.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '')
        )}`,
        { signal: controller.signal }
      )
      if (!response.ok) return
      const data = (await response.json()) as {
        hits?: { points?: number; num_comments?: number }[]
      }
      let best = { points: 0, comments: 0 }
      for (const hit of data.hits ?? []) {
        if ((hit.points ?? 0) > best.points) {
          best = { points: hit.points ?? 0, comments: hit.num_comments ?? 0 }
        }
      }
      if (best.points > 0) {
        buzz.set(item.id, { ...best, where: 'Hacker News' })
      }
    } catch {
      // Offline or blocked: popularity just has less to go on.
    } finally {
      clearTimeout(timer)
    }
  }
  // A few at a time, so the edition is not held up for long.
  const queue = [...items]
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        await ask(item)
      }
    })
  )
  return buzz
}

const DAY = 24 * 3600 * 1000

export const makeEdition = async (
  state: EditionState,
  now: Date,
  sourceName: (item: LibraryItemNode) => string
): Promise<Edition> => {
  const latest = state.editions[0]
  // Everything since the last edition was made, or the last day and a half
  // for the first one. Quiet days reach back up to four days.
  const since =
    latest && now.getTime() - Date.parse(latest.builtAt) < 4 * DAY
      ? new Date(latest.builtAt)
      : new Date(now.getTime() - 1.5 * DAY)
  const reach = new Date(Math.min(since.getTime(), now.getTime() - 4 * DAY))

  const [feedItems, queue, videos, history] = await Promise.all([
    searchItems(
      `in:following use:folders -type:video -is:seen saved:${isoDay(
        reach
      )}..* sort:saved-desc`,
      200
    ),
    searchItems(
      `in:inbox use:folders is:unread -type:video saved:${isoDay(
        new Date(now.getTime() - 30 * DAY)
      )}..* sort:saved-desc`,
      60
    ),
    searchItems(
      `in:following use:folders type:video -is:seen saved:${isoDay(
        since
      )}..* sort:saved-desc`,
      40
    ),
    searchItems(
      `in:all saved:${isoDay(
        new Date(now.getTime() - 60 * DAY)
      )}..* sort:saved-desc`,
      400
    ),
  ])

  const arrivedSince = (item: LibraryItemNode) =>
    Date.parse(item.savedAt || item.createdAt) >= since.getTime()
  const recent = feedItems.filter(arrivedSince)
  // On a quiet day, older unseen feed items fill the gaps.
  const feedPool =
    recent.length >= 12
      ? recent
      : [...recent, ...feedItems.filter((i) => !arrivedSince(i))].slice(0, 40)

  const skipped = new Set(state.editions.flatMap((e) => e.skipped))
  const featured = new Set(
    state.editions.flatMap((e) => e.entries.map((entry) => entry.id))
  )
  const candidates = [...feedPool, ...queue]
  const buzz = await hackerNewsBuzz(
    candidates.filter((item) => !featured.has(item.id)).slice(0, 60)
  )

  return buildEdition({
    now,
    date: editionDateFor(now, state.hour),
    number: (latest?.number ?? 0) + 1,
    candidates,
    videos: videos.filter(arrivedSince),
    history,
    skipped,
    featured,
    buzz,
    sourceName,
  })
}

// Today's edition, made and saved now if it does not exist yet.
export const loadTodaysEdition = async (
  sourceName: (item: LibraryItemNode) => string,
  now = new Date()
): Promise<EditionState> => {
  const state = await loadEditionState()
  const date = editionDateFor(now, state.hour)
  if (state.editions[0]?.date === date) {
    return state
  }
  const edition = await makeEdition(state, now, sourceName)
  return updateEditionState((latest) =>
    // Another device may have made it in the meantime; keep theirs.
    latest.editions[0]?.date === date
      ? latest
      : { ...latest, editions: [edition, ...latest.editions] }
  )
}
