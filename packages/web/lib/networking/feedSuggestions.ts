import { useQuery, useQueryClient } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { useCallback } from 'react'
import { subscribeMutation } from './mutations/subscribeMutation'
import { unsubscribeMutation } from './mutations/unsubscribeMutation'
import { gqlFetcher } from './networkHelpers'
import { SubscriptionType } from './queries/useGetSubscriptionsQuery'

// Feeds Stash suggests from what you read. The server builds them each night;
// see packages/api/src/services/feed_suggestions.ts.

export type FeedSuggestionStatus =
  | 'NEW'
  | 'FOLLOWING'
  | 'TRIAL'
  | 'KEPT'
  | 'DISMISSED'

export type FeedSuggestionReason = {
  // link: one of your feeds links to it; blogroll: one of your feeds lists
  // it in its blogroll; save: you save from it; writer: a writer you finish
  // writes it; neighbour: it links to the same places as one of your
  // favourite feeds; similar: a related publisher in the reviewed catalog;
  // starter: a starting point, offered only while your reading leads to too
  // few suggestions (its title is the topic).
  kind:
    | 'link'
    | 'blogroll'
    | 'save'
    | 'writer'
    | 'neighbour'
    | 'similar'
    | 'starter'
  guide: string
  guideName: string
  count: number
  title?: string
}

export type FeedSuggestionPost = {
  title: string
  url: string
  image?: string
  summary?: string
  publishedAt?: string
  minutes?: number
}

export type FeedSuggestion = {
  id: string
  siteUrl: string
  feedUrl?: string
  // 'rss', or 'youtube' for a channel
  kind: string
  title: string
  description?: string
  icon?: string
  author?: string
  postsPerWeek?: number
  lastPostAt?: string
  score: number
  signals: Record<string, number>
  reasons: FeedSuggestionReason[]
  latest: FeedSuggestionPost[]
  status: FeedSuggestionStatus
  subscriptionId?: string
  trialEndsAt?: string
}

export type FeedSuggestions = {
  suggestions: FeedSuggestion[]
  builtAt?: string
  articlesConsidered: number
  // false when you've turned suggestions off in Settings
  enabled: boolean
}

export const isChannel = (s: FeedSuggestion): boolean => s.kind == 'youtube'

export const isStarter = (s: FeedSuggestion): boolean =>
  s.reasons[0]?.kind == 'starter'

const SUGGESTION_FIELDS = gql`
  fragment FeedSuggestionFields on FeedSuggestion {
    id
    siteUrl
    feedUrl
    kind
    title
    description
    icon
    author
    postsPerWeek
    lastPostAt
    score
    signals
    reasons {
      kind
      guide
      guideName
      count
      title
    }
    latest {
      title
      url
      image
      summary
      publishedAt
      minutes
    }
    status
    subscriptionId
    trialEndsAt
  }
`

const GQL_FEED_SUGGESTIONS = gql`
  ${SUGGESTION_FIELDS}
  query FeedSuggestions($statuses: [FeedSuggestionStatus!], $first: Int) {
    feedSuggestions(statuses: $statuses, first: $first) {
      ... on FeedSuggestionsSuccess {
        suggestions {
          ...FeedSuggestionFields
        }
        builtAt
        articlesConsidered
        enabled
      }
      ... on FeedSuggestionsError {
        errorCodes
      }
    }
  }
`

const GQL_UPDATE_FEED_SUGGESTION = gql`
  ${SUGGESTION_FIELDS}
  mutation UpdateFeedSuggestion($input: UpdateFeedSuggestionInput!) {
    updateFeedSuggestion(input: $input) {
      ... on UpdateFeedSuggestionSuccess {
        suggestion {
          ...FeedSuggestionFields
        }
      }
      ... on UpdateFeedSuggestionError {
        errorCodes
      }
    }
  }
`

const GQL_REFRESH_FEED_SUGGESTIONS = gql`
  mutation RefreshFeedSuggestions {
    refreshFeedSuggestions {
      ... on RefreshFeedSuggestionsSuccess {
        queued
      }
      ... on RefreshFeedSuggestionsError {
        errorCodes
      }
    }
  }
`

const GQL_SET_FEED_SUGGESTIONS_ENABLED = gql`
  mutation SetFeedSuggestionsEnabled($enabled: Boolean!) {
    setFeedSuggestionsEnabled(enabled: $enabled) {
      ... on SetFeedSuggestionsEnabledSuccess {
        enabled
      }
      ... on SetFeedSuggestionsEnabledError {
        errorCodes
      }
    }
  }
`

export const FEED_SUGGESTIONS_KEY = 'feedSuggestions'

// New suggestions, plus the ones you're trying or have followed from here,
// so the page can show what you did with each. Each status is asked for on
// its own so a long history never crowds out what's new.
const SHOWN: [FeedSuggestionStatus, number][] = [
  ['NEW', 40],
  ['TRIAL', 20],
  ['FOLLOWING', 12],
]

export const DISMISSED_KEY = 'dismissedFeedSuggestions'
// When to look again after the server starts looking for more.
const TOP_UP_CHECKS = [60_000, 180_000]

// Feeds you've said no to, latest first, so they can be let back in.
export function useDismissedSuggestions(enabled = true) {
  return useQuery({
    queryKey: [DISMISSED_KEY],
    queryFn: async (): Promise<FeedSuggestion[]> => {
      const response = (await gqlFetcher(GQL_FEED_SUGGESTIONS, {
        statuses: ['DISMISSED'],
        first: 100,
      })) as {
        feedSuggestions: FeedSuggestions & { errorCodes?: string[] }
      }
      if (response.feedSuggestions.errorCodes?.length) {
        throw new Error(response.feedSuggestions.errorCodes[0])
      }
      return response.feedSuggestions.suggestions
    },
    enabled,
  })
}

export function useFeedSuggestions(enabled = true) {
  return useQuery({
    queryKey: [FEED_SUGGESTIONS_KEY],
    queryFn: async (): Promise<FeedSuggestions> => {
      const pages = await Promise.all(
        SHOWN.map(async ([status, first]) => {
          const response = (await gqlFetcher(GQL_FEED_SUGGESTIONS, {
            statuses: [status],
            first,
          })) as {
            feedSuggestions: FeedSuggestions & { errorCodes?: string[] }
          }
          if (response.feedSuggestions.errorCodes?.length) {
            throw new Error(response.feedSuggestions.errorCodes[0])
          }
          return response.feedSuggestions
        })
      )
      return {
        ...pages[0],
        suggestions: pages.flatMap((page) => page.suggestions),
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

type Action = 'FOLLOW' | 'TRY' | 'KEEP' | 'DROP' | 'DISMISS' | 'RESTORE'

export async function updateFeedSuggestion(
  id: string,
  action: Action,
  subscriptionId?: string
): Promise<FeedSuggestion | undefined> {
  const response = (await gqlFetcher(GQL_UPDATE_FEED_SUGGESTION, {
    input: { id, action, subscriptionId },
  })) as {
    updateFeedSuggestion: {
      suggestion?: FeedSuggestion
      errorCodes?: string[]
    }
  }
  if (response.updateFeedSuggestion.errorCodes?.length) {
    throw new Error(response.updateFeedSuggestion.errorCodes[0])
  }
  return response.updateFeedSuggestion.suggestion
}

// Turning suggestions off forgets them all on the server; turning them on
// starts the first look straight away.
export async function setFeedSuggestionsEnabled(
  enabled: boolean
): Promise<boolean> {
  const response = (await gqlFetcher(GQL_SET_FEED_SUGGESTIONS_ENABLED, {
    enabled,
  })) as {
    setFeedSuggestionsEnabled: { enabled?: boolean; errorCodes?: string[] }
  }
  const result = response.setFeedSuggestionsEnabled
  if (result.errorCodes?.length || result.enabled === undefined) {
    throw new Error(result.errorCodes?.[0] ?? 'NOT_SET')
  }
  return result.enabled
}

// Whether suggestions are on. They count as on until the server says
// otherwise, so nothing flickers away while loading.
export function useFeedSuggestionsEnabled(): boolean {
  const { data } = useFeedSuggestions()
  return data?.enabled !== false
}

export async function refreshFeedSuggestions(): Promise<boolean> {
  const response = (await gqlFetcher(GQL_REFRESH_FEED_SUGGESTIONS)) as {
    refreshFeedSuggestions: { queued?: boolean }
  }
  return !!response.refreshFeedSuggestions.queued
}

// Following or trying a suggestion subscribes to its feed, then records
// what you did so the next night's suggestions learn from it. Each returns
// an undo.
export function useSuggestionActions() {
  const queryClient = useQueryClient()

  const setStatus = useCallback(
    (id: string, status: FeedSuggestionStatus) =>
      queryClient.setQueryData<FeedSuggestions>(
        [FEED_SUGGESTIONS_KEY],
        (data) =>
          data && {
            ...data,
            suggestions: data.suggestions.map((s) =>
              s.id == id ? { ...s, status } : s
            ),
          }
      ),
    [queryClient]
  )

  // A feed you turn down makes room for the next best one straight away.
  // When few are left the server also looks for more, so check back once
  // that look has had time to finish.
  const fillTheGap = useCallback(() => {
    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: [FEED_SUGGESTIONS_KEY] })
      void queryClient.invalidateQueries({ queryKey: [DISMISSED_KEY] })
    }
    refetch()
    TOP_UP_CHECKS.forEach((ms) => setTimeout(refetch, ms))
  }, [queryClient])

  const refreshFeeds = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    await queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
  }, [queryClient])

  const subscribe = useCallback(
    async (
      suggestion: FeedSuggestion,
      action: 'FOLLOW' | 'TRY'
    ): Promise<(() => Promise<void>) | undefined> => {
      if (!suggestion.feedUrl) return undefined
      const previous = suggestion.status
      setStatus(suggestion.id, action == 'TRY' ? 'TRIAL' : 'FOLLOWING')
      const result = await subscribeMutation({
        url: suggestion.feedUrl,
        subscriptionType: SubscriptionType.RSS,
      })
      const subscriptionId = result.subscribe.subscriptions?.[0]?.id
      const already = result.subscribe.errorCodes?.includes(
        'ALREADY_SUBSCRIBED' as never
      )
      if (!subscriptionId && !already) {
        setStatus(suggestion.id, previous)
        return undefined
      }
      await updateFeedSuggestion(suggestion.id, action, subscriptionId)
      await refreshFeeds()
      return async () => {
        if (subscriptionId) {
          await unsubscribeMutation(suggestion.title, subscriptionId)
        }
        await updateFeedSuggestion(suggestion.id, 'RESTORE')
        setStatus(suggestion.id, 'NEW')
        await refreshFeeds()
      }
    },
    [refreshFeeds, setStatus]
  )

  const dismiss = useCallback(
    async (suggestion: FeedSuggestion): Promise<() => Promise<void>> => {
      queryClient.setQueryData<FeedSuggestions>(
        [FEED_SUGGESTIONS_KEY],
        (data) =>
          data && {
            ...data,
            suggestions: data.suggestions.filter((s) => s.id != suggestion.id),
          }
      )
      await updateFeedSuggestion(suggestion.id, 'DISMISS')
      fillTheGap()
      return async () => {
        await updateFeedSuggestion(suggestion.id, 'RESTORE')
        await queryClient.invalidateQueries({
          queryKey: [FEED_SUGGESTIONS_KEY],
        })
        await queryClient.invalidateQueries({ queryKey: [DISMISSED_KEY] })
      }
    },
    [queryClient, fillTheGap]
  )

  // Lets a feed you turned down be suggested again.
  const restore = useCallback(
    async (suggestion: FeedSuggestion): Promise<() => Promise<void>> => {
      queryClient.setQueryData<FeedSuggestion[]>([DISMISSED_KEY], (data) =>
        data?.filter((s) => s.id != suggestion.id)
      )
      await updateFeedSuggestion(suggestion.id, 'RESTORE')
      await queryClient.invalidateQueries({ queryKey: [FEED_SUGGESTIONS_KEY] })
      return async () => {
        await updateFeedSuggestion(suggestion.id, 'DISMISS')
        await queryClient.invalidateQueries({ queryKey: [DISMISSED_KEY] })
        await queryClient.invalidateQueries({
          queryKey: [FEED_SUGGESTIONS_KEY],
        })
      }
    },
    [queryClient]
  )

  // Ending a trial unsubscribes from the feed. Undo starts the trial again.
  const drop = useCallback(
    async (suggestion: FeedSuggestion): Promise<() => Promise<void>> => {
      queryClient.setQueryData<FeedSuggestions>(
        [FEED_SUGGESTIONS_KEY],
        (data) =>
          data && {
            ...data,
            suggestions: data.suggestions.filter((s) => s.id != suggestion.id),
          }
      )
      if (suggestion.subscriptionId) {
        await unsubscribeMutation(suggestion.title, suggestion.subscriptionId)
      }
      await updateFeedSuggestion(suggestion.id, 'DROP')
      await refreshFeeds()
      fillTheGap()
      return async () => {
        await subscribe(suggestion, 'TRY')
        await queryClient.invalidateQueries({
          queryKey: [FEED_SUGGESTIONS_KEY],
        })
      }
    },
    [queryClient, refreshFeeds, subscribe, fillTheGap]
  )

  return {
    follow: (s: FeedSuggestion) => subscribe(s, 'FOLLOW'),
    tryForAWeek: (s: FeedSuggestion) => subscribe(s, 'TRY'),
    dismiss,
    drop,
    restore,
  }
}
