import { LibraryItemState } from '../entity/library_item'
import { findLibraryItemById } from '../services/library_item'
import { savePage, shouldParseInBackend } from '../services/save_page'
import { findActiveUser } from '../services/user'
import { fetchArticlePage } from '../utils/fetchArticlePage'
import { wordsCount } from '../utils/helpers'
import { logger } from '../utils/logger'
import { parsePreparedContent } from '../utils/parser'

export const RESCUE_SAVE_JOB = 'rescue-save'
// The browser fetch usually lands within ten seconds, and the reader gives
// up waiting after thirty, so the rescue runs in between.
export const RESCUE_SAVE_DELAY_MS = 15_000

export interface RescueSaveJobData {
  userId: string
  libraryItemId: string
}

// A saved link still has no article once the browser fetch has had its
// chance: the fetcher was busy, restarted, ran out of memory, or the site
// is blocked for the hour after repeated feed failures. Read the page
// directly instead, as feeds do, so the save doesn't sit unparsed forever.
export const rescueSave = async ({
  userId,
  libraryItemId,
}: RescueSaveJobData) => {
  const item = await findLibraryItemById(libraryItemId, userId, {
    select: ['id', 'originalUrl', 'state', 'folder', 'savedAt'],
  })
  if (!item || item.state !== LibraryItemState.Processing) {
    return
  }

  const url = item.originalUrl
  const input = {
    url,
    clientRequestId: item.id,
    source: 'rescue-save',
    folder: item.folder,
    savedAt: item.savedAt,
  }
  // Tweets and videos are read through their own APIs, not the page.
  if (shouldParseInBackend({ ...input, originalContent: '' })) {
    return
  }

  const html = await fetchArticlePage(url)
  if (!html) {
    logger.info('rescue-save: page could not be read', { url })
    return
  }

  // A bot wall or cookie page parses to a few words; leave those for the
  // browser rather than saving them as the article.
  const parsed = await parsePreparedContent(url, {
    document: html,
    pageInfo: { canonicalUrl: url },
  })
  const words = parsed.parsedContent?.textContent
    ? wordsCount(parsed.parsedContent.textContent)
    : 0
  if (words < 100) {
    logger.info('rescue-save: page holds too little to be the article', {
      url,
      words,
    })
    return
  }

  // The browser may have landed while the page was read.
  const latest = await findLibraryItemById(libraryItemId, userId, {
    select: ['id', 'state'],
  })
  if (latest?.state !== LibraryItemState.Processing) {
    return
  }

  const user = await findActiveUser(userId)
  if (!user) {
    return
  }

  const result = await savePage({ ...input, originalContent: html }, user)
  if (result.__typename === 'SaveError') {
    logger.error('rescue-save: save failed', { url, result })
    return
  }
  logger.info('rescue-save: saved from the page', { url, words })
}
