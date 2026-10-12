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
  // link: one of your feeds links to it; save: you save from it; writer: a
  // writer you finish writes it; neighbour: it links to the same places as
  // one of your favourite feeds.
  kind: 'link' | 'save' | 'writer' | 'neighbour' | 'similar'
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
}

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

export const FEED_SUGGESTIONS_KEY = 'feedSuggestions'

// New suggestions, plus the ones you're trying or have followed from here,
// so the page can show what you did with each. Each status is asked for on
// its own so a long history never crowds out what's new.
const SHOWN: [FeedSuggestionStatus, number][] = [
  ['NEW', 40],
  ['TRIAL', 20],
  ['FOLLOWING', 12],
]

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
      return async () => {
        await updateFeedSuggestion(suggestion.id, 'RESTORE')
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
      return async () => {
        await subscribe(suggestion, 'TRY')
        await queryClient.invalidateQueries({
          queryKey: [FEED_SUGGESTIONS_KEY],
        })
      }
    },
    [queryClient, refreshFeeds, subscribe]
  )

  return {
    follow: (s: FeedSuggestion) => subscribe(s, 'FOLLOW'),
    tryForAWeek: (s: FeedSuggestion) => subscribe(s, 'TRY'),
    dismiss,
    drop,
  }
}
