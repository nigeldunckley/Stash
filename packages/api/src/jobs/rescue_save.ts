import { LibraryItem, LibraryItemState } from '../entity/library_item'
import { authTrx } from '../repository'
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

  // Claim the item on the primary so a browser fetch that landed while the
  // page was read is never overwritten by this plainer copy.
  const setState = (from: LibraryItemState, to: LibraryItemState) =>
    authTrx(
      (tx) =>
        tx
          .getRepository(LibraryItem)
          .update({ id: item.id, state: from }, { state: to }),
      { uid: userId, replicationMode: 'primary' }
    )
  const claimed = await setState(
    LibraryItemState.Processing,
    LibraryItemState.Succeeded
  )
  if (!claimed.affected) {
    return
  }

  try {
    const user = await findActiveUser(userId)
    if (!user) {
      throw new Error('user not found')
    }
    const result = await savePage({ ...input, originalContent: html }, user)
    if (result.__typename === 'SaveError') {
      throw new Error(result.message || 'save failed')
    }
    logger.info('rescue-save: saved from the page', { url, words })
  } catch (error) {
    // Hand the item back, so it still reads as unparsed and can be retried.
    logger.error('rescue-save: save failed', { url, error })
    await setState(LibraryItemState.Succeeded, LibraryItemState.Processing)
  }
}
