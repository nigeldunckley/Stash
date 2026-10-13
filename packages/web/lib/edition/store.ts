// Loads this week's issue of The Edition, or makes it the first time it is
// opened once it is out. Issues and settings are kept with your account (in
// the personalization settings), so the Mac and iPhone show the same one.

import { gql } from 'graphql-request'
import { gqlSearchQuery } from '../networking/library_items/gql'
import type {
  LibraryItemNode,
  LibraryItems,
} from '../networking/library_items/useLibraryItems'
import { gqlFetcher } from '../networking/networkHelpers'
import { issueNumber } from './discovery'
import { Buzz, Edition, HighlightInput, buildEdition } from './engine'
import {
  DEFAULT_ISSUE_DAY,
  DEFAULT_ISSUE_HOUR,
  issueIsOut,
  weekStart,
} from './weekly'

export type EditionSettings = {
  // The day (0 is Sunday) and hour a new issue comes out.
  day: number
  hour: number
  // Show the issue's strip on Home while it is out and unopened.
  showOnHome: boolean
  // How many saves Home's Up next shows.
  upNext: number
  // Issue dates opened, and marked read.
  opened: string[]
  read: string[]
}

export type EditionState = EditionSettings & { editions: Edition[] }

export const DEFAULT_UP_NEXT = 5
const KEEP_EDITIONS = 12

type Stored = { weekly?: Partial<EditionSettings>; editions?: unknown }
type Fields = Record<string, unknown> & { edition?: Stored }

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

const numberOr = (value: unknown, fallback: number) =>
  typeof value === 'number' ? value : fallback
const datesOf = (value: unknown) =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []

const stateOf = (fields: Fields): EditionState => {
  const weekly = fields.edition?.weekly ?? {}
  const editions = fields.edition?.editions
  return {
    day: numberOr(weekly.day, DEFAULT_ISSUE_DAY),
    hour: numberOr(weekly.hour, DEFAULT_ISSUE_HOUR),
    showOnHome: weekly.showOnHome !== false,
    upNext: numberOr(weekly.upNext, DEFAULT_UP_NEXT),
    opened: datesOf(weekly.opened),
    read: datesOf(weekly.read),
    // Daily editions from before The Edition went weekly are left behind.
    editions: Array.isArray(editions)
      ? (editions as Edition[]).filter((e) => e?.kind === 'weekly')
      : [],
  }
}

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
  const { editions, ...settings } = next
  const weekly = {
    ...settings,
    opened: settings.opened.slice(-KEEP_EDITIONS),
    read: settings.read.slice(-KEEP_EDITIONS),
  }
  const data = (await gqlFetcher(GQL_SET_FIELDS, {
    input: { fields: { ...fields, edition: { weekly, editions } } },
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

const GQL_HIGHLIGHTS = gql`
  query EditionHighlights($first: Int, $after: String) {
    highlights(first: $first, after: $after) {
      ... on HighlightsSuccess {
        edges {
          node {
            id
            type
            quote
            createdAt
            libraryItem {
              id
              slug
              title
              siteName
              originalArticleUrl
              url
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      ... on HighlightsError {
        errorCodes
      }
    }
  }
`

type HighlightNode = {
  id: string
  type: string
  quote?: string
  createdAt: string
  libraryItem?: {
    id: string
    slug: string
    title: string
    siteName?: string
    originalArticleUrl?: string
    url: string
  }
}

const hostOf = (url?: string) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

// Your most recent highlights, up to `max`. If they can't be read the issue
// goes out without them.
const recentHighlights = async (max: number): Promise<HighlightInput[]> => {
  const found: HighlightInput[] = []
  let after: string | undefined
  try {
    while (found.length < max) {
      const data = (await gqlFetcher(GQL_HIGHLIGHTS, { first: 50, after })) as {
        highlights?: {
          edges?: { node: HighlightNode }[]
          pageInfo?: { hasNextPage: boolean; endCursor: string }
        }
      }
      const edges = data.highlights?.edges ?? []
      edges.forEach(({ node }) => {
        const item = node.libraryItem
        if (node.type !== 'HIGHLIGHT' || !item) return
        found.push({
          id: node.id,
          quote: node.quote,
          createdAt: node.createdAt,
          item: {
            id: item.id,
            slug: item.slug,
            title: item.title,
            source:
              item.siteName || hostOf(item.originalArticleUrl || item.url),
          },
        })
      })
      if (!data.highlights?.pageInfo?.hasNextPage || !edges.length) break
      after = data.highlights.pageInfo.endCursor
    }
  } catch (error) {
    console.log('error loading highlights for The Edition', error)
  }
  return found
}

const DAY = 24 * 3600 * 1000

export const makeEdition = async (
  state: EditionState,
  date: string,
  now: Date,
  sourceName: (item: LibraryItemNode) => string
): Promise<Edition> => {
  const since = weekStart(date)
  const [missed, shelf, history, read, highlights] = await Promise.all([
    searchItems(
      `in:following use:folders -type:video saved:${isoDay(
        since
      )}..* sort:saved-desc`,
      300
    ),
    searchItems(
      `in:inbox use:folders is:unread -type:video saved:*..${isoDay(
        new Date(now.getTime() - 14 * DAY)
      )} sort:saved-desc`,
      80
    ),
    searchItems(
      `in:all saved:${isoDay(
        new Date(now.getTime() - 60 * DAY)
      )}..* sort:saved-desc`,
      400
    ),
    searchItems(`in:all read:${isoDay(since)}..* sort:read-desc`, 200),
    recentHighlights(200),
  ])

  const skipped = new Set(state.editions.flatMap((e) => e.skipped))
  const featured = new Set(
    state.editions.flatMap((e) => [
      ...e.entries.map((entry) => entry.id),
      ...(e.quotes ?? []).map((quote) => quote.id),
    ])
  )
  const buzz = await hackerNewsBuzz(
    missed.filter((item) => !featured.has(item.id)).slice(0, 60)
  )

  return buildEdition({
    now,
    date,
    number: issueNumber(date),
    missed,
    shelf,
    history,
    read,
    highlights,
    skipped,
    featured,
    buzz,
    sourceName,
  })
}

// This week's issue, made and saved now if it is out and doesn't exist yet.
// Between issues the state is returned as it is, holding the last one.
export const loadThisWeeksEdition = async (
  sourceName: (item: LibraryItemNode) => string,
  now = new Date()
): Promise<EditionState> => {
  const state = await loadEditionState()
  const { out, date } = issueIsOut(now, state, [])
  if (!out || state.editions[0]?.date === date) {
    return state
  }
  const edition = await makeEdition(state, date, now, sourceName)
  return updateEditionState((latest) =>
    // Another device may have made it in the meantime; keep theirs.
    latest.editions[0]?.date === date
      ? latest
      : { ...latest, editions: [edition, ...latest.editions] }
  )
}
