import { appDataSource } from '../data_source'
import { buildFeedSuggestions } from '../services/feed_suggestions'
import { logger } from '../utils/logger'

export const BUILD_FEED_SUGGESTIONS_JOB = 'build-feed-suggestions'

export type BuildFeedSuggestionsJobData = {
  // Only this user; otherwise everyone with an active account.
  userId?: string
}

export const buildFeedSuggestionsJob = async (
  data: BuildFeedSuggestionsJobData = {}
) => {
  const userIds = data.userId
    ? [data.userId]
    : (
        (await appDataSource.query(
          `SELECT id FROM omnivore.user WHERE status = 'ACTIVE'`
        )) as { id: string }[]
      ).map((u) => u.id)

  for (const userId of userIds) {
    try {
      await buildFeedSuggestions(userId)
    } catch (error) {
      logger.error('feed-suggestions: build failed', { userId, error })
    }
  }
}
