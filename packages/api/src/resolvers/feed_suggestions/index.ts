import { FeedSuggestion } from '../../entity/feed_suggestion'
import {
  FeedSuggestionsError,
  FeedSuggestionsErrorCode,
  FeedSuggestionsSuccess,
  FeedSuggestionStatus,
  MutationUpdateFeedSuggestionArgs,
  QueryFeedSuggestionsArgs,
  RefreshFeedSuggestionsError,
  RefreshFeedSuggestionsSuccess,
  UpdateFeedSuggestionError,
  UpdateFeedSuggestionErrorCode,
  UpdateFeedSuggestionSuccess,
} from '../../generated/graphql'
import {
  actOnFeedSuggestion,
  listFeedSuggestions,
} from '../../services/feed_suggestions'
import { Merge } from '../../util'
import { enqueueBuildFeedSuggestions } from '../../utils/createTask'
import { authorized } from '../../utils/gql-utils'

type FeedSuggestionsSuccessPartial = Merge<
  FeedSuggestionsSuccess,
  { suggestions: FeedSuggestion[] }
>

export const feedSuggestionsResolver = authorized<
  FeedSuggestionsSuccessPartial,
  FeedSuggestionsError,
  QueryFeedSuggestionsArgs
>(async (_, { statuses, first }, { uid, log }) => {
  try {
    const result = await listFeedSuggestions(
      uid,
      (statuses ?? [FeedSuggestionStatus.New]).map(
        (s) => s.toLowerCase() as FeedSuggestion['status']
      ),
      Math.min(Math.max(first ?? 24, 1), 100)
    )
    return {
      suggestions: result.suggestions,
      builtAt: result.builtAt,
      articlesConsidered: result.articles,
    }
  } catch (error) {
    log.error('feed suggestions failed', error)
    return { errorCodes: [FeedSuggestionsErrorCode.BadRequest] }
  }
})

export const updateFeedSuggestionResolver = authorized<
  Merge<UpdateFeedSuggestionSuccess, { suggestion: FeedSuggestion }>,
  UpdateFeedSuggestionError,
  MutationUpdateFeedSuggestionArgs
>(async (_, { input }, { uid }) => {
  const suggestion = await actOnFeedSuggestion(
    uid,
    input.id,
    input.action,
    input.subscriptionId
  )
  if (!suggestion) {
    return { errorCodes: [UpdateFeedSuggestionErrorCode.NotFound] }
  }
  return { suggestion }
})

export const refreshFeedSuggestionsResolver = authorized<
  RefreshFeedSuggestionsSuccess,
  RefreshFeedSuggestionsError
>(async (_, __, { uid }) => {
  const job = await enqueueBuildFeedSuggestions(uid)
  return { queued: !!job }
})
