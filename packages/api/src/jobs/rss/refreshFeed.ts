import axios from 'axios'
import crypto from 'crypto'
import dns from 'dns'
import http from 'http'
import https from 'https'
import { parseHTML } from 'linkedom'
import * as privateIpLib from 'private-ip'
import Parser, { Item } from 'rss-parser'
import { v4 as uuid } from 'uuid'
import { FetchContentType } from '../../entity/subscription'
import { env } from '../../env'
import { ArticleSavingRequestStatus } from '../../generated/graphql'
import { redisDataSource } from '../../redis_data_source'
import { validateUrl } from '../../services/create_page_save_request'
import { savePage } from '../../services/save_page'
import {
  updateSubscription,
  updateSubscriptions,
} from '../../services/update_subscription'
import { hasFeedItem } from '../../services/library_item'
import { findActiveUser } from '../../services/user'
import createHttpTaskWithToken, {
  enqueueFetchContentJob,
  FetchContentJobData,
} from '../../utils/createTask'
import { cleanUrl, generateFingerprint, wordsCount } from '../../utils/helpers'
import { logger } from '../../utils/logger'
import { parsePreparedContent, rssParserConfig } from '../../utils/parser'
import { videoIdFromYouTubeUrl } from '../../utils/youtube'
import {
  channelIdFromFeedUrl,
  channelUploads,
  isShortsLink,
  longFormVideoIds,
  mediaDescription,
  videoDocument,
  videoThumbnail,
  watchUrl,
} from '../../utils/youtubeChannel'
import { RSSRefreshContext } from './refreshAllFeeds'

type FolderType = 'following' | 'inbox'

interface RefreshFeedRequest {
  subscriptionIds: string[]
  feedUrl: string
  mostRecentItemDates: number[] // unix timestamp in milliseconds
  scheduledTimestamps: number[] // unix timestamp in milliseconds
  lastFetchedChecksums: string[]
  userIds: string[]
  fetchContentTypes: FetchContentType[]
  folders: FolderType[]
  // Per subscription, whether a YouTube channel's Shorts are wanted. Older
  // jobs don't carry it, which means no.
  includeShorts?: boolean[]
  refreshContext?: RSSRefreshContext
  priority?: 'low' | 'high'
}

export const isRefreshFeedRequest = (data: any): data is RefreshFeedRequest => {
  return (
    'subscriptionIds' in data &&
    'feedUrl' in data &&
    'mostRecentItemDates' in data &&
    'scheduledTimestamps' in data &&
    'userIds' in data &&
    'lastFetchedChecksums' in data &&
    'fetchContentTypes' in data &&
    'folders' in data
  )
}

// link can be a string or an object
type RssFeedItemLink = string | { $: { rel?: string; href: string } }
type RssFeedItemAuthor = string | { name: string }
type RssFeed = Parser.Output<{
  published?: string
  updated?: string
  created?: string
  link?: RssFeedItemLink
  links?: RssFeedItemLink[]
  author?: RssFeedItemAuthor
}> & {
  lastBuildDate?: string
  'syn:updatePeriod'?: string
  'syn:updateFrequency'?: string
  'sy:updatePeriod'?: string
  'sy:updateFrequency'?: string
}
type RssFeedItemMedia = {
  $: {
    url: string
    width?: string
    height?: string
    medium?: string
    type?: string
  }
}
export type RssFeedItem = Item & {
  'media:thumbnail'?: RssFeedItemMedia
  'media:content'?: RssFeedItemMedia[]
  'media:group'?: unknown
  'yt:videoId'?: string
  link: string
}

interface UserConfig {
  id: string
  folder: FolderType
  libraryItemId: string
}

interface FetchContentTask {
  users: Map<string, UserConfig> // userId -> User
  item: RssFeedItem
}

export const isOldItem = (
  item: RssFeedItem,
  mostRecentItemTimestamp: number,
  // How far back a feed's first check reaches.
  firstLookBackMs = 24 * 60 * 60 * 1000
) => {
  // always fetch items without isoDate
  if (!item.isoDate) {
    return false
  }

  const publishedAt = new Date(item.isoDate)

  // don't fetch older than 24 hrs items for new feeds
  if (!mostRecentItemTimestamp) {
    return publishedAt < new Date(Date.now() - firstLookBackMs)
  }

  // Items dated a little before the newest one already seen are still looked
  // at: feeds often add a post late, dated when it was drafted or scheduled.
  // processSubscription skips the ones already in the library.
  return publishedAt <= new Date(mostRecentItemTimestamp - LATE_ITEM_WINDOW_MS)
}

// How far behind the newest item already seen a late feed item may be dated.
export const LATE_ITEM_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

const feedFetchFailedRedisKey = (feedUrl: string) =>
  `feed-fetch-failure:${feedUrl}`

const isFeedBlocked = async (feedUrl: string) => {
  const key = feedFetchFailedRedisKey(feedUrl)
  const redisClient = redisDataSource.redisClient
  try {
    const result = await redisClient?.get(key)
    // if the feed has failed to fetch more than certain times, block it
    const maxFailures = parseInt(process.env.MAX_FEED_FETCH_FAILURES ?? '10')
    if (result && parseInt(result) > maxFailures) {
      logger.info(`feed is blocked: ${feedUrl}`)
      return true
    }
  } catch (error) {
    logger.error('Failed to check feed block status', { feedUrl, error })
  }

  return false
}

const incrementFeedFailure = async (feedUrl: string) => {
  const redisClient = redisDataSource.redisClient
  const key = feedFetchFailedRedisKey(feedUrl)
  try {
    const result = await redisClient?.incr(key)
    // expire the key in 1 day
    await redisClient?.expire(key, 24 * 60 * 60)

    return result
  } catch (error) {
    logger.error('Failed to block feed', { feedUrl, error })
    return null
  }
}

export const isContentFetchBlocked = (feedUrl: string) => {
  if (feedUrl.startsWith('https://arxiv.org/')) {
    return true
  }
  if (feedUrl.startsWith('https://rss.arxiv.org')) {
    return true
  }
  if (feedUrl.startsWith('https://rsshub.app')) {
    return true
  }
  if (feedUrl.startsWith('https://xkcd.com')) {
    return true
  }
  if (feedUrl.startsWith('https://daringfireball.net/feeds/')) {
    return true
  }
  if (feedUrl.startsWith('https://lwn.net/headlines/newrss')) {
    return true
  }
  if (feedUrl.startsWith('https://medium.com')) {
    return true
  }
  return false
}

const getThumbnail = (item: RssFeedItem): string | undefined => {
  if (item['media:thumbnail']?.$?.url) {
    return item['media:thumbnail'].$.url
  }

  const media = item['media:content']?.find(
    (media) =>
      media.$?.medium === 'image' || media.$?.type?.startsWith('image/')
  )?.$?.url
  if (media) {
    return media
  }

  if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
    return item.enclosure.url
  }

  // Otherwise the thumbnail job picks the largest picture in the content.
  return undefined
}

export const fetchAndChecksum = async (url: string) => {
  try {
    const response = await axios.get(url, {
      ...rssParserConfig(),
      responseType: 'arraybuffer',
      timeout: 60_000,
      maxRedirects: 10,
    })

    const hash = crypto.createHash('sha256')
    hash.update(response.data as Buffer)

    const dataStr = (response.data as Buffer).toString()

    return { url, content: dataStr, checksum: hash.digest('hex') }
  } catch (error) {
    logger.info(`Failed to fetch or hash content from ${url}.`, error)
    return null
  }
}

const parseFeed = async (url: string, content: string) => {
  try {
    // check if url is a telegram channel or preview
    const telegramRegex = /t\.me\/([^/]+)/
    const telegramMatch = url.match(telegramRegex)
    if (telegramMatch) {
      let channel = telegramMatch[1]
      if (channel.startsWith('s/')) {
        channel = channel.slice(2)
      } else {
        // open the preview page to get the data
        const fetchResult = await fetchAndChecksum(`https://t.me/s/${channel}`)
        if (!fetchResult) {
          return null
        }

        content = fetchResult.content
      }

      const dom = parseHTML(content).document
      const title =
        dom
          .querySelector('meta[property="og:title"]')
          ?.getAttribute('content') || dom.title
      // post has attribute data-post
      const posts = dom.querySelectorAll('[data-post]')
      const items = Array.from(posts)
        .map((post) => {
          const id = post.getAttribute('data-post')?.split('/')[1]
          if (!id) {
            return null
          }

          const url = `https://t.me/s/${channel}/${id}`
          const content = post.outerHTML

          // find the <time> element
          const time = post.querySelector('time')
          const dateTime = time?.getAttribute('datetime') || undefined

          return {
            link: url,
            isoDate: dateTime,
            title: `${title} - ${id}`,
            creator: title,
            content,
            links: [url],
          }
        })
        .filter((item) => !!item) as RssFeedItem[]

      return {
        title,
        items,
      }
    }

    // return await is needed to catch errors thrown by the parser
    // otherwise the error will be caught by the outer try catch
    return await parser.parseString(content)
  } catch (error) {
    logger.info(error)
    return null
  }
}

const isItemRecentlySaved = async (userId: string, url: string) => {
  const key = `recent-saved-item:${userId}:${url}`
  try {
    const result = await redisDataSource.redisClient?.get(key)
    return !!result
  } catch (err) {
    logger.error('error checking if item is old', err)
  }
  // If we failed to check, assume the item is good
  return false
}

const addFetchContentTask = (
  fetchContentTasks: Map<string, FetchContentTask>,
  userId: string,
  folder: FolderType,
  item: RssFeedItem,
  libraryItemId = uuid()
) => {
  const url = item.link
  const task = fetchContentTasks.get(url)
  const userConfig = { id: userId, folder, libraryItemId }

  if (!task) {
    fetchContentTasks.set(url, {
      users: new Map([[userId, userConfig]]),
      item,
    })
  } else {
    task.users.set(userId, userConfig)
  }

  return true
}

const createTask = async (
  fetchContentTasks: Map<string, FetchContentTask>,
  userId: string,
  feedUrl: string,
  item: RssFeedItem,
  fetchContentType: FetchContentType,
  folder: FolderType,
  youtube?: YouTubeFeed
) => {
  const isRecentlySaved = await isItemRecentlySaved(userId, item.link)
  if (isRecentlySaved) {
    logger.info(`Item recently saved ${item.link}`)
    return true
  }

  if (youtube) {
    return createYouTubeVideoItem(userId, feedUrl, item, folder, youtube)
  }

  const feedContent = item.content || item.contentSnippet || item.summary
  if (
    fetchContentType === FetchContentType.Never ||
    (fetchContentType === FetchContentType.WhenEmpty && feedContent)
  ) {
    return createItemWithFeedContent(userId, feedUrl, item, folder, feedContent)
  }

  // Most article pages carry their full text without a browser, so read the
  // page directly first.
  if (await createItemFromPage(userId, feedUrl, item, folder, feedContent)) {
    return true
  }

  // Otherwise list the item from the feed straight away, then fetch the full
  // page into the same item with the browser. If the page can't be fetched (the site blocks it, times
  // out, or its domain has failed too often) the item still shows, with what
  // the feed carried, instead of never appearing.
  const libraryItemId = await createItemWithFeedContent(
    userId,
    feedUrl,
    item,
    folder,
    feedContent
  )
  logger.info(`adding fetch content task ${userId}  ${item.link.trim()}`)
  return addFetchContentTask(
    fetchContentTasks,
    userId,
    folder,
    item,
    typeof libraryItemId == 'string' ? libraryItemId : undefined
  )
}

const fetchContentAndCreateItem = async (
  users: UserConfig[],
  feedUrl: string,
  item: RssFeedItem,
  priority = 'low' as 'low' | 'high'
) => {
  const data: FetchContentJobData = {
    users,
    source: 'rss-feeder',
    url: item.link.trim(),
    labels: [{ name: 'RSS' }],
    rssFeedUrl: feedUrl,
    savedAt: item.isoDate,
    publishedAt: item.isoDate,
    priority,
  }

  try {
    const contentFetchQueueEnabled =
      process.env.CONTENT_FETCH_QUEUE_ENABLED === 'true'
    if (contentFetchQueueEnabled) {
      return await enqueueFetchContentJob(data)
    }

    return await createHttpTaskWithToken({
      queue: 'omnivore-rss-feed-queue',
      taskHandlerUrl: env.queue.contentFetchGCFUrl,
      payload: {
        ...data,
        priority: 'high', // use one queue for all RSS feeds for now
      },
    })
  } catch (error) {
    logger.error('Error while creating task', error)
    return false
  }
}

// A YouTube channel feed: its entries are videos, saved straight from the
// feed so Stash never has to fetch YouTube's pages for them.
type YouTubeFeed = {
  channelId: string
  channelName: string
  // Video IDs to keep when Shorts are left out, if YouTube listed them.
  longForm?: Set<string>
}

const youtubeVideoId = (item: RssFeedItem) =>
  item['yt:videoId'] ||
  videoIdFromYouTubeUrl(item.link) ||
  item.link.match(/\/shorts\/([\w-]{11})/)?.[1]

// Shorts are left out unless the subscription asks for them. YouTube's list
// of long videos decides; when it is missing, the /shorts/ link does.
const isUnwantedShort = (
  item: RssFeedItem,
  youtube: YouTubeFeed,
  includeShorts: boolean
) => {
  if (includeShorts) {
    return false
  }
  const id = youtubeVideoId(item)
  if (youtube.longForm && id) {
    return !youtube.longForm.has(id)
  }
  return isShortsLink(item.link)
}

const createYouTubeVideoItem = async (
  userId: string,
  feedUrl: string,
  item: RssFeedItem,
  folder: FolderType,
  youtube: YouTubeFeed
) => {
  const videoId = youtubeVideoId(item)
  if (!videoId) {
    logger.error('youtube: feed entry without a video id', { link: item.link })
    return false
  }

  try {
    const user = await findActiveUser(userId)
    if (!user) {
      logger.error('User not found', { userId })
      return false
    }

    const title = item.title || watchUrl(videoId)
    const result = await savePage(
      {
        url: isShortsLink(item.link) ? item.link : watchUrl(videoId),
        title,
        folder,
        rssFeedUrl: feedUrl,
        savedAt: item.isoDate,
        publishedAt: item.isoDate,
        originalContent: videoDocument({
          videoId,
          title,
          channel: youtube.channelName,
          channelUrl: `https://www.youtube.com/channel/${youtube.channelId}`,
          description:
            mediaDescription(item['media:group']) || item.contentSnippet,
        }),
        source: 'rss-feeder',
        clientRequestId: '',
        author: youtube.channelName,
        previewImage: videoThumbnail(videoId),
        // The video job sets the length; until then it is unknown.
        wordCount: 0,
        labels: [{ name: 'RSS' }],
      },
      user
    )

    if (result.__typename === 'SaveError') {
      logger.error(`youtube: could not save video: ${result.errorCodes[0]}`)
      return false
    }

    return true
  } catch (error) {
    logger.error('youtube: could not save video', error)
    return false
  }
}

// Feed links come from whoever publishes the feed, so article pages are only
// fetched from public addresses: every connection, redirects included,
// resolves its host here first.
const publicLookup = ((
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number
  ) => void
) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      return callback(error, [])
    }
    if (addresses.some((a) => privateIpLib.default(a.address))) {
      return callback(new Error(`private address for ${hostname}`), [])
    }
    if (options.all) {
      return callback(null, addresses)
    }
    callback(null, addresses[0].address, addresses[0].family)
  })
}) as unknown as typeof dns.lookup
// Hosts written as an address skip the lookup, so they're checked directly.
const isPrivateHost = (hostname: string) =>
  !!privateIpLib.default(hostname.replace(/^\[|\]$/g, ''))
const publicHttpAgent = new http.Agent({ lookup: publicLookup })
const publicHttpsAgent = new https.Agent({ lookup: publicLookup })

// The article's page, when it can be read without a browser.
const fetchArticlePage = async (url: string) => {
  try {
    if (isPrivateHost(new URL(url).hostname)) {
      return undefined
    }
    const fingerprint = generateFingerprint()
    const response = await axios.get<string>(url, {
      headers: {
        'user-agent': fingerprint.headers['user-agent'],
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
      },
      responseType: 'text',
      timeout: 20_000,
      maxRedirects: 10,
      maxContentLength: 10 * 1024 * 1024,
      httpAgent: publicHttpAgent,
      httpsAgent: publicHttpsAgent,
      proxy: false,
      beforeRedirect: (options: { hostname?: string }) => {
        if (options.hostname && isPrivateHost(options.hostname)) {
          throw new Error(`redirect to a private address: ${options.hostname}`)
        }
      },
    })
    const contentType = String(response.headers['content-type'] || '')
    if (!contentType.includes('html') || typeof response.data != 'string') {
      return undefined
    }
    return response.data
  } catch (error) {
    logger.info('rss: page could not be read directly', {
      url,
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

// Saves the full article from its page. Returns false, saving nothing, when
// the page can't be read or holds no more than the feed already did, so the
// browser can try instead.
const createItemFromPage = async (
  userId: string,
  feedUrl: string,
  item: RssFeedItem,
  folder: FolderType,
  feedContent?: string
) => {
  const url = cleanUrl(item.link)
  const html = await fetchArticlePage(url)
  if (!html) {
    return false
  }

  try {
    const parsed = await parsePreparedContent(url, {
      document: html,
      pageInfo: { canonicalUrl: url, title: item.title },
    })
    const pageWords = parsed.parsedContent?.textContent
      ? wordsCount(parsed.parsedContent.textContent)
      : 0
    const feedWords = feedContent ? wordsCount(feedContent, true) : 0
    if (pageWords < Math.max(100, feedWords * 0.8)) {
      logger.info('rss: page holds no more than the feed', {
        url,
        pageWords,
        feedWords,
      })
      return false
    }

    const user = await findActiveUser(userId)
    if (!user) {
      logger.error('User not found', { userId })
      return false
    }

    const result = await savePage(
      {
        url,
        feedContent,
        title: item.title,
        folder,
        rssFeedUrl: feedUrl,
        savedAt: item.isoDate,
        publishedAt: item.isoDate,
        originalContent: html,
        source: 'rss-feeder',
        clientRequestId: '',
        author: item.creator,
        previewImage: getThumbnail(item),
        labels: [{ name: 'RSS' }],
      },
      user
    )
    if (result.__typename === 'SaveError') {
      logger.error(`rss: could not save page: ${result.errorCodes[0]}`)
      return false
    }

    logger.info('rss: saved full article from its page', { url, pageWords })
    return true
  } catch (error) {
    logger.error('rss: could not save page', { url, error })
    return false
  }
}

const createItemWithFeedContent = async (
  userId: string,
  feedUrl: string,
  item: RssFeedItem,
  folder: FolderType,
  feedContent?: string
) => {
  try {
    logger.info('saving feed item with feed content', {
      userId,
      feedUrl,
      item,
      folder,
    })

    // Store the source image; the API signs it at the size each view needs.
    const previewImage = getThumbnail(item)
    const url = cleanUrl(item.link)

    const user = await findActiveUser(userId)
    if (!user) {
      logger.error('User not found', { userId })
      return false
    }

    const result = await savePage(
      {
        url,
        feedContent,
        title: item.title,
        folder,
        rssFeedUrl: feedUrl,
        savedAt: item.isoDate,
        publishedAt: item.isoDate,
        originalContent: feedContent || '',
        source: 'rss-feeder',
        state: ArticleSavingRequestStatus.ContentNotFetched,
        clientRequestId: '',
        author: item.creator,
        previewImage,
        labels: [{ name: 'RSS' }],
      },
      user
    )

    if (result.__typename === 'SaveError') {
      logger.error(
        `Error while saving feed item with feed content: ${result.errorCodes[0]}`
      )
      return false
    }

    // The saved item's id, so a page fetch can fill in the same item.
    return ('clientRequestId' in result && result.clientRequestId) || true
  } catch (error) {
    logger.error('Error while saving feed item with feed content', error)
    return false
  }
}

const parser = new Parser({
  customFields: {
    item: [
      ['link', 'links', { keepArray: true }],
      'published',
      'updated',
      'created',
      ['media:content', 'media:content', { keepArray: true }],
      ['media:thumbnail'],
      ['media:group', 'media:group'],
      ['yt:videoId', 'yt:videoId'],
      'author',
    ],
    feed: [
      'lastBuildDate',
      'syn:updatePeriod',
      'syn:updateFrequency',
      'sy:updatePeriod',
      'sy:updateFrequency',
    ],
  },
})

const getUpdateFrequency = (feed: RssFeed) => {
  const updateFrequency =
    feed['syn:updateFrequency'] || feed['sy:updateFrequency']

  if (!updateFrequency) {
    return 1
  }

  const frequency = parseInt(updateFrequency, 10)
  if (isNaN(frequency)) {
    return 1
  }

  return frequency
}

// Feeds are checked again after the period they declare, kept between half an
// hour and two hours so new items show up within a reasonable time.
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000
const MAX_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000
// YouTube channel feeds are small and new videos are wanted quickly.
const YOUTUBE_CHECK_INTERVAL_MS = 15 * 60 * 1000

export const nextCheckAt = (
  feed: RssFeed,
  now = Date.now(),
  feedUrl = ''
): Date => {
  if (channelIdFromFeedUrl(feedUrl)) {
    return new Date(now + YOUTUBE_CHECK_INTERVAL_MS)
  }
  const declared =
    feed['syn:updatePeriod'] || feed['sy:updatePeriod']
      ? getUpdatePeriodInHours(feed) * 60 * 60 * 1000 * getUpdateFrequency(feed)
      : MIN_CHECK_INTERVAL_MS
  const interval = Math.min(
    MAX_CHECK_INTERVAL_MS,
    Math.max(MIN_CHECK_INTERVAL_MS, declared)
  )
  return new Date(now + interval)
}

const getUpdatePeriodInHours = (feed: RssFeed) => {
  const updatePeriod = feed['syn:updatePeriod'] || feed['sy:updatePeriod']

  switch (updatePeriod) {
    case 'hourly':
      return 1
    case 'daily':
      return 24
    case 'weekly':
      return 7 * 24
    case 'monthly':
      return 30 * 24
    case 'yearly':
      return 365 * 24
    default:
      // default to hourly
      return 1
  }
}

// get link following the order of preference: via, alternate, self
const getLink = (
  links: RssFeedItemLink[],
  feedUrl: string
): string | undefined => {
  // sort links by preference
  const sortedLinks: string[] = []

  links.forEach((link) => {
    // if link is a string, it is the href
    if (typeof link === 'string') {
      return sortedLinks.push(link)
    }

    if (link.$.rel === 'via') {
      sortedLinks[0] = link.$.href
    }
    if (link.$.rel === 'alternate') {
      sortedLinks[1] = link.$.href
    }
    if (link.$.rel === 'self' || !link.$.rel) {
      sortedLinks[2] = link.$.href
    }
  })

  // return the first link that is not undefined
  const itemUrl = sortedLinks.find((link) => !!link)
  if (!itemUrl) {
    return undefined
  }

  // convert relative url to absolute url
  const url = new URL(itemUrl, feedUrl).href
  if (!validateUrl(url)) {
    return undefined
  }

  return url
}

// get author
const getAuthor = (author: RssFeedItemAuthor) => {
  if (typeof author === 'string') {
    return author
  }
  return author.name
}

const processSubscription = async (
  fetchContentTasks: Map<string, FetchContentTask>,
  subscriptionId: string,
  userId: string,
  feedUrl: string,
  fetchResult: { content: string; checksum: string },
  mostRecentItemDate: number,
  lastFetchedChecksum: string,
  fetchContentType: FetchContentType,
  folder: FolderType,
  feed: RssFeed,
  youtube?: YouTubeFeed,
  includeShorts = false
) => {
  const refreshedAt = new Date()
  const scheduledAt = nextCheckAt(feed, refreshedAt.getTime(), feedUrl)
  // A new channel starts with its last week of videos rather than one day.
  const firstLookBackMs = (youtube ? 7 : 1) * 24 * 60 * 60 * 1000

  let lastItemFetchedAt: Date | null = null
  let lastValidItem: RssFeedItem | null = null

  // Even when nothing is new, record the check and when to look again.
  // A check that found nothing new still succeeded, so any earlier failure
  // is over.
  const recordCheck = async (lastFetchedChecksum?: string) => {
    await updateSubscription(userId, subscriptionId, {
      refreshedAt,
      scheduledAt,
      lastFetchedChecksum,
      failedAt: null,
    })
  }

  if (fetchResult.checksum === lastFetchedChecksum) {
    logger.info('feed has not been updated', { feedUrl, lastFetchedChecksum })
    return recordCheck()
  }
  const updatedLastFetchedChecksum = fetchResult.checksum

  // fetch feed
  let itemCount = 0,
    failedAt: Date | null = null

  // The feed's lastBuildDate is not trusted to skip it: many feeds never
  // update it. The checksum above and the item dates below decide instead.

  // save each item in the feed
  for (const item of feed.items) {
    try {
      const guid = item.guid || item.link
      // use published or updated if isoDate is not available for atom feeds
      const isoDate =
        item.isoDate || item.published || item.updated || item.created

      logger.info('Processing feed item', {
        guid,
        links: item.links,
        isoDate,
        feedUrl,
      })

      if (!guid) {
        throw new Error('Invalid feed item')
      }

      // fallback to guid if link is not available
      const link =
        (item.links?.length ? getLink(item.links, feedUrl) : undefined) ||
        (item.link ? getLink([item.link], feedUrl) : undefined) ||
        guid
      if (!link) {
        throw new Error('Invalid feed item link')
      }

      const creator = item.creator || (item.author && getAuthor(item.author))

      const feedItem = {
        ...item,
        isoDate,
        link,
        creator,
      }

      // A date in the future (a wrong time zone, a scheduled post) would
      // otherwise hold back every item dated before it.
      const datedAt = feedItem.isoDate
        ? new Date(feedItem.isoDate)
        : refreshedAt
      const publishedAt =
        isNaN(datedAt.getTime()) || datedAt > refreshedAt
          ? refreshedAt
          : datedAt

      if (youtube && isUnwantedShort(feedItem, youtube, includeShorts)) {
        logger.info(`Skipping YouTube Short ${feedItem.link}`)
        continue
      }

      // remember the last valid item
      if (
        !lastValidItem ||
        (lastValidItem.isoDate && publishedAt > new Date(lastValidItem.isoDate))
      ) {
        lastValidItem = feedItem
      }

      // Max limit per-feed update
      if (itemCount > 99) {
        if (itemCount == 100) {
          logger.info(`Max limit reached for feed ${feedUrl}`)
        }
        itemCount = itemCount + 1
        continue
      }

      // skip old items
      if (isOldItem(feedItem, mostRecentItemDate, firstLookBackMs)) {
        logger.info(`Skipping old feed item ${feedItem.link}`)
        continue
      }

      // An item dated before the newest one already seen may have been
      // added to the feed late, and an undated one can't be told apart by
      // date at all; either is new unless it is already saved.
      if (
        mostRecentItemDate &&
        (!feedItem.isoDate || publishedAt.getTime() <= mostRecentItemDate) &&
        (await hasFeedItem(
          userId,
          feedUrl,
          cleanUrl(feedItem.link),
          feedItem.title
        ))
      ) {
        continue
      }

      const created = await createTask(
        fetchContentTasks,
        userId,
        feedUrl,
        feedItem,
        fetchContentType,
        folder,
        youtube
      )
      if (!created) {
        throw new Error('Failed to create task for feed item')
      }

      // remember the last item fetched at
      if (!lastItemFetchedAt || publishedAt > lastItemFetchedAt) {
        lastItemFetchedAt = publishedAt
      }

      itemCount = itemCount + 1
    } catch (error) {
      logger.error('Error while saving RSS feed item', { error, item })
      failedAt = new Date()
    }
  }

  // no items saved
  if (!lastItemFetchedAt && !failedAt) {
    // the feed has been fetched before, no new valid items found
    if (mostRecentItemDate || !lastValidItem) {
      logger.info('No new valid items found')
      return recordCheck(updatedLastFetchedChecksum)
    }

    // the feed has never been fetched, save at least the last valid item
    const created = await createTask(
      fetchContentTasks,
      userId,
      feedUrl,
      lastValidItem,
      fetchContentType,
      folder,
      youtube
    )
    if (!created) {
      logger.error('Failed to create task for feed item', {
        url: lastValidItem.link,
      })
      failedAt = new Date()
    }

    const datedAt = lastValidItem.isoDate
      ? new Date(lastValidItem.isoDate)
      : refreshedAt
    lastItemFetchedAt =
      isNaN(datedAt.getTime()) || datedAt > refreshedAt ? refreshedAt : datedAt
  }

  // A late item, or a check where every item failed, doesn't move the newest
  // date seen backwards.
  if (
    mostRecentItemDate &&
    (!lastItemFetchedAt || lastItemFetchedAt.getTime() < mostRecentItemDate)
  ) {
    lastItemFetchedAt = new Date(mostRecentItemDate)
  }

  // update subscription mostRecentItemDate and refreshedAt
  const updatedSubscription = await updateSubscription(userId, subscriptionId, {
    mostRecentItemDate: lastItemFetchedAt,
    // When an item failed, the feed is read again at the next check even if
    // it hasn't changed, so the item gets another try.
    lastFetchedChecksum: failedAt
      ? lastFetchedChecksum
      : updatedLastFetchedChecksum,
    scheduledAt,
    refreshedAt,
    failedAt,
  })
  logger.info('Updated subscription', updatedSubscription)
}

export const refreshFeed = async (request: any) => {
  if (isRefreshFeedRequest(request)) {
    return _refreshFeed(request)
  }
  logger.info('not a feed to refresh')
  return false
}

// A YouTube channel's latest uploads shaped like its feed, for when YouTube
// doesn't serve the feed itself.
const youtubeUploadsFeed = async (feedUrl: string, channelId: string) => {
  try {
    const channel = await channelUploads(channelId)
    if (!channel) {
      return undefined
    }
    const ids = channel.uploads.map((upload) => upload.id).join(',')
    const fetchResult = {
      url: feedUrl,
      content: ids,
      checksum: crypto.createHash('sha256').update(ids).digest('hex'),
    }
    const feed = {
      title: channel.title,
      items: channel.uploads.map(
        (upload): RssFeedItem & { links: string[] } => ({
          guid: `yt:video:${upload.id}`,
          link: watchUrl(upload.id),
          links: [watchUrl(upload.id)],
          title: upload.title,
          isoDate: upload.publishedAt?.toISOString(),
          contentSnippet: upload.description,
          'yt:videoId': upload.id,
        })
      ),
    }
    logger.info('youtube: read uploads without the feed', {
      channelId,
      count: feed.items.length,
    })
    return { fetchResult, feed }
  } catch (error) {
    logger.info('youtube: uploads unavailable', {
      channelId,
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

export const _refreshFeed = async (request: RefreshFeedRequest) => {
  const {
    feedUrl,
    subscriptionIds,
    mostRecentItemDates,
    userIds,
    lastFetchedChecksums,
    fetchContentTypes,
    folders,
    includeShorts,
    refreshContext,
    priority,
  } = request

  logger.info('Processing feed', feedUrl, { refreshContext: refreshContext })

  try {
    const isBlocked = await isFeedBlocked(feedUrl)
    if (isBlocked) {
      logger.info(`feed is blocked: ${feedUrl}`)
      throw new Error('feed is blocked')
    }

    const channelId = channelIdFromFeedUrl(feedUrl)
    let fetchResult = await fetchAndChecksum(feedUrl)
    let feed = fetchResult
      ? await parseFeed(feedUrl, fetchResult.content)
      : null
    if (!feed && channelId) {
      const uploads = await youtubeUploadsFeed(feedUrl, channelId)
      if (uploads) {
        fetchResult = uploads.fetchResult
        feed = uploads.feed
      }
    }
    if (!fetchResult) {
      logger.error(`Failed to fetch RSS feed ${feedUrl}`)
      await incrementFeedFailure(feedUrl)
      throw new Error('Failed to fetch RSS feed')
    }

    if (!feed) {
      logger.error(`Failed to parse RSS feed ${feedUrl}`)
      await incrementFeedFailure(feedUrl)
      throw new Error('Failed to parse RSS feed')
    }

    let allowFetchContent = true
    if (isContentFetchBlocked(feedUrl)) {
      logger.info(`fetching content blocked for feed: ${feedUrl}`)
      allowFetchContent = false
    }

    logger.info('Fetched feed', { title: feed.title, at: new Date() })

    const youtube: YouTubeFeed | undefined = channelId
      ? {
          channelId,
          channelName: feed.title || channelId,
          longForm: subscriptionIds.every((_, i) => includeShorts?.[i])
            ? undefined
            : await longFormVideoIds(channelId),
        }
      : undefined

    const fetchContentTasks = new Map<string, FetchContentTask>() // url -> FetchContentTask
    // process each subscription sequentially
    for (let i = 0; i < subscriptionIds.length; i++) {
      const subscriptionId = subscriptionIds[i]
      const fetchContentType = allowFetchContent
        ? fetchContentTypes[i]
        : FetchContentType.Never

      try {
        await processSubscription(
          fetchContentTasks,
          subscriptionId,
          userIds[i],
          feedUrl,
          fetchResult,
          mostRecentItemDates[i],
          lastFetchedChecksums[i],
          fetchContentType,
          folders[i],
          feed,
          youtube,
          !!includeShorts?.[i]
        )
      } catch (error) {
        logger.error('Error while processing subscription', {
          error,
          subscriptionId,
        })
      }
    }

    // create fetch content tasks
    for (const task of fetchContentTasks.values()) {
      await fetchContentAndCreateItem(
        Array.from(task.users.values()),
        feedUrl,
        task.item,
        priority
      )
    }

    return true
  } catch (error) {
    logger.error('Error while saving RSS feeds', {
      feedUrl,
      subscriptionIds,
      error,
    })

    const now = new Date()
    // mark subscriptions as error if we failed to get the feed
    await updateSubscriptions(subscriptionIds, {
      refreshedAt: now,
      failedAt: now,
    })

    return false
  }
}
