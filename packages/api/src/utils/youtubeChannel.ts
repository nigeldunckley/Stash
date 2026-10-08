import axios from 'axios'
import { parseHTML } from 'linkedom'
import Parser from 'rss-parser'
import _ from 'underscore'
import { logger } from './logger'
import { videoIdFromYouTubeUrl } from './youtube'

// YouTube channels publish their latest uploads as an Atom feed. Stash
// follows a channel by subscribing to that feed like any other.
const FEED_BASE = 'https://www.youtube.com/feeds/videos.xml'
const CHANNEL_ID = /^UC[\w-]{22}$/

// Without these, a server in Europe gets YouTube's cookie-consent page instead
// of the channel. SOCS is the answer to that page; the language keeps names
// and dates in English.
const PAGE_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'accept-language': 'en-GB,en;q=0.9',
  cookie: 'SOCS=CAI; CONSENT=YES+1',
}

export type YouTubeVideo = {
  id: string
  title: string
  url: string
  thumbnail: string
  publishedAt?: Date
}

export type YouTubeChannel = {
  channelId: string
  feedUrl: string
  title: string
  handle?: string
  avatar?: string
  videos: YouTubeVideo[]
  uploadsPerWeek?: number
}

export const channelFeedUrl = (channelId: string) =>
  `${FEED_BASE}?channel_id=${channelId}`

// The channel's uploads without Shorts (and without past live streams):
// YouTube's "UULF" playlist mirrors the uploads playlist for long videos.
export const longFormFeedUrl = (channelId: string) =>
  `${FEED_BASE}?playlist_id=UULF${channelId.slice(2)}`

export const channelIdFromFeedUrl = (url: string): string | undefined => {
  try {
    const parsed = new URL(url)
    if (
      !parsed.hostname.endsWith('youtube.com') ||
      parsed.pathname != '/feeds/videos.xml'
    ) {
      return undefined
    }
    const id = parsed.searchParams.get('channel_id')
    return id && CHANNEL_ID.test(id) ? id : undefined
  } catch {
    return undefined
  }
}

export const isYouTubeChannelFeed = (url: string) => !!channelIdFromFeedUrl(url)

export const isYouTubeUrl = (value: string) => {
  const trimmed = value.trim()
  if (/^@[\w.-]{3,}$/.test(trimmed)) {
    return true
  }
  try {
    const host = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    ).hostname
    return /(^|\.)youtube\.com$/.test(host) || host == 'youtu.be'
  } catch {
    return false
  }
}

export const isShortsLink = (url: string) => /\/shorts\//.test(url)

// The largest thumbnail YouTube makes for every video. It is 4:3 with black
// bars, which a 16:9 crop removes exactly.
export const videoThumbnail = (videoId: string) =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

export const watchUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`

const fetchPage = async (url: string) => {
  const response = await axios.get<string>(url, {
    headers: PAGE_HEADERS,
    timeout: 15000,
    maxRedirects: 5,
    responseType: 'text',
  })
  return response.data
}

const meta = (document: Document, property: string) =>
  document
    .querySelector(`meta[property="${property}"], meta[name="${property}"]`)
    ?.getAttribute('content') || undefined

type ChannelPage = {
  channelId?: string
  title?: string
  handle?: string
  avatar?: string
}

const readChannelPage = (html: string): ChannelPage => {
  const { document } = parseHTML(html)
  const canonical =
    document.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
  const fromCanonical = canonical.match(/\/channel\/(UC[\w-]{22})/)?.[1]
  const fromMeta = document
    .querySelector('meta[itemprop="identifier"], meta[itemprop="channelId"]')
    ?.getAttribute('content')
  const fromData =
    html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ||
    html.match(/"channelId":"(UC[\w-]{22})"/)?.[1]
  const handle =
    html.match(/"canonicalBaseUrl":"\/(@[^"]+)"/)?.[1] ||
    html.match(
      /"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/(@[^"]+)"/
    )?.[1]

  return {
    channelId:
      fromCanonical ||
      (fromMeta && CHANNEL_ID.test(fromMeta) ? fromMeta : undefined) ||
      fromData,
    title: meta(document, 'og:title'),
    avatar: meta(document, 'og:image'),
    handle: handle ? decodeURIComponent(handle) : undefined,
  }
}

// Turns what someone pasted (a channel link, an @handle, a feed address or a
// link to one of the channel's videos) into the address of a channel page.
const channelPageFor = async (
  value: string
): Promise<{ page?: string; channelId?: string } | undefined> => {
  const trimmed = value.trim()
  if (/^@[\w.-]{3,}$/.test(trimmed)) {
    return { page: `https://www.youtube.com/${trimmed}` }
  }

  let url: URL
  try {
    url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    )
  } catch {
    return undefined
  }

  const feedId = channelIdFromFeedUrl(url.href)
  if (feedId) {
    return {
      channelId: feedId,
      page: `https://www.youtube.com/channel/${feedId}`,
    }
  }

  const pathId = url.pathname.match(/^\/channel\/(UC[\w-]{22})/)?.[1]
  if (pathId) {
    return {
      channelId: pathId,
      page: `https://www.youtube.com/channel/${pathId}`,
    }
  }

  const videoId =
    videoIdFromYouTubeUrl(url.href) ||
    url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/)?.[1]
  if (videoId) {
    // oEmbed names the channel that posted the video.
    const oembed = await axios.get<{ author_url?: string }>(
      'https://www.youtube.com/oembed',
      {
        params: { url: watchUrl(videoId), format: 'json' },
        headers: PAGE_HEADERS,
        timeout: 10000,
      }
    )
    const authorUrl = oembed.data.author_url
    return authorUrl ? { page: authorUrl } : undefined
  }

  const path = url.pathname.match(/^\/(@[^/]+|c\/[^/]+|user\/[^/]+)/)?.[1]
  if (path) {
    return { page: `https://www.youtube.com/${path}` }
  }

  return undefined
}

const feedParser = new Parser<
  Record<string, unknown>,
  { 'yt:videoId'?: string; 'media:group'?: unknown }
>({
  customFields: {
    item: [
      ['yt:videoId', 'yt:videoId'],
      ['media:group', 'media:group'],
    ],
  },
})

export const fetchChannelFeed = async (feedUrl: string) => {
  const xml = await fetchPage(feedUrl)
  return feedParser.parseString(xml)
}

const uploadsPerWeek = (dates: Date[]) => {
  if (dates.length < 2) {
    return undefined
  }
  const newest = Math.max(...dates.map((date) => date.getTime()))
  const oldest = Math.min(...dates.map((date) => date.getTime()))
  const weeks = (newest - oldest) / (7 * 24 * 60 * 60 * 1000)
  if (weeks <= 0) {
    return undefined
  }
  return Math.round(((dates.length - 1) / weeks) * 10) / 10
}

export const resolveYouTubeChannel = async (
  value: string,
  videoCount = 3
): Promise<YouTubeChannel | undefined> => {
  try {
    const target = await channelPageFor(value)
    if (!target) {
      return undefined
    }

    let page: ChannelPage = { channelId: target.channelId }
    if (target.page) {
      try {
        page = { ...readChannelPage(await fetchPage(target.page)), ...page }
      } catch (error) {
        // Without the page a channel ID is still enough to follow it.
        if (!target.channelId) throw error
        logger.info('youtube: channel page unavailable', { value })
      }
    }

    const channelId = page.channelId
    if (!channelId || !CHANNEL_ID.test(channelId)) {
      return undefined
    }

    const feedUrl = channelFeedUrl(channelId)
    const feed = await fetchChannelFeed(feedUrl)
    const videos = feed.items
      .map((item): YouTubeVideo | undefined => {
        const id = item['yt:videoId'] || videoIdFromYouTubeUrl(item.link)
        if (!id) {
          return undefined
        }
        return {
          id,
          title: item.title || '',
          url: item.link || watchUrl(id),
          thumbnail: videoThumbnail(id),
          publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
        }
      })
      .filter((video): video is YouTubeVideo => !!video)

    return {
      channelId,
      feedUrl,
      title: page.title || feed.title || channelId,
      handle: page.handle,
      avatar: page.avatar,
      videos: videos
        .filter((video) => !isShortsLink(video.url))
        .slice(0, videoCount),
      uploadsPerWeek: uploadsPerWeek(
        videos
          .map((video) => video.publishedAt)
          .filter((date): date is Date => !!date)
      ),
    }
  } catch (error) {
    logger.info('youtube: could not resolve channel', { value, error })
    return undefined
  }
}

// The IDs of a channel's latest long videos, so Shorts can be left out. Falls
// back to undefined when YouTube doesn't answer, and callers then rely on the
// /shorts/ link instead.
export const longFormVideoIds = async (
  channelId: string
): Promise<Set<string> | undefined> => {
  try {
    const feed = await fetchChannelFeed(longFormFeedUrl(channelId))
    return new Set(
      feed.items
        .map((item) => item['yt:videoId'] || videoIdFromYouTubeUrl(item.link))
        .filter((id): id is string => !!id)
    )
  } catch (error) {
    logger.info('youtube: long-form feed unavailable', { channelId, error })
    return undefined
  }
}

const first = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : value

const text = (value: unknown): string | undefined => {
  const item = first(value)
  if (typeof item == 'string') return item
  if (item && typeof item == 'object' && '_' in item) {
    return String((item as { _: unknown })._)
  }
  return undefined
}

// The description from a feed entry's media:group.
export const mediaDescription = (group: unknown): string | undefined => {
  const media = first(group) as Record<string, unknown> | undefined
  return media ? text(media['media:description']) : undefined
}

// The page Stash stores for a video: YouTube's player followed by the
// description, in the same shape the YouTube content handler produces so the
// Reader and the video job treat both alike.
export const videoDocument = (args: {
  videoId: string
  title: string
  channel: string
  channelUrl: string
  description?: string
}) => {
  const title = _.escape(args.title)
  const channel = _.escape(args.channel)
  const url = watchUrl(args.videoId)
  const paragraphs = (args.description || '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${_.escape(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n')

  return `<html>
  <head><title>${title}</title>
  <meta property="og:image" content="${videoThumbnail(args.videoId)}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${_.escape(args.description || '')}" />
  <meta property="og:article:author" content="${channel}" />
  <meta property="og:site_name" content="YouTube" />
  <meta property="og:type" content="video" />
  </head>
  <body>
  <div>
    <article id="_omnivore_youtube">
      <iframe id="_omnivore_youtube_video" width="622" height="350" src="https://www.youtube.com/embed/${
        args.videoId
      }" title="${title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      <p><a href="${url}" target="_blank">${title}</a></p>
      <p itemscope="" itemprop="author" itemtype="http://schema.org/Person">By <a href="${_.escape(
        args.channelUrl
      )}" target="_blank">${channel}</a></p>
      ${paragraphs}
      <div id="_omnivore_youtube_transcript"></div>
    </article>
  </div>
  </body>
</html>`
}
