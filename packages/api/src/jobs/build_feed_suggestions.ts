import { appDataSource } from '../data_source'
import {
  buildFeedSuggestions,
  feedSuggestionsEnabled,
} from '../services/feed_suggestions'
import { enqueueBuildFeedSuggestions } from '../utils/createTask'
import { logger } from '../utils/logger'

export const BUILD_FEED_SUGGESTIONS_JOB = 'build-feed-suggestions'

export type BuildFeedSuggestionsJobData = {
  // Only this user; otherwise everyone with an active account.
  userId?: string
}

// The nightly run queues one bounded job per reader, so a slow site or a
// big library never holds up anyone else's suggestions.
export const buildFeedSuggestionsJob = async (
  data: BuildFeedSuggestionsJobData = {}
) => {
  if (data.userId) {
    try {
      if (!(await feedSuggestionsEnabled(data.userId))) return
      await buildFeedSuggestions(data.userId)
    } catch (error) {
      logger.error('feed-suggestions: build failed', {
        userId: data.userId,
        error,
      })
      throw error
    }
    return
  }

  // Readers who turned suggestions off in Settings are left out.
  const users = (await appDataSource.query(
    `SELECT u.id FROM omnivore.user u
     LEFT JOIN omnivore.user_personalization p ON p.user_id = u.id
     WHERE u.status = 'ACTIVE'
       AND coalesce(p.fields->>'suggestFeeds', 'true') <> 'false'`
  )) as { id: string }[]
  for (const { id } of users) {
    await enqueueBuildFeedSuggestions(id)
  }
}
