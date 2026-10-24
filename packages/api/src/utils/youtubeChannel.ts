import _ from 'underscore'
import { videoIdFromYouTubeUrl } from './youtube'
import {
  channels,
  ChannelResource,
  searchChannels,
  thumbnail,
  videos,
  youtubeList,
  YouTubeUnavailableError,
} from '../services/youtube/client'
export { YouTubeUnavailableError }
const CHANNEL_ID = /^UC[\w-]{22}$/
export const channelFeedUrl = (id: string) =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`
export const channelIdFromFeedUrl = (value: string): string | undefined => {
  try {
    const u = new URL(value)
    const id = u.searchParams.get('channel_id')
    return /(^|\.)youtube\.com$/.test(u.hostname) &&
      u.pathname === '/feeds/videos.xml' &&
      id &&
      CHANNEL_ID.test(id)
      ? id
      : undefined
  } catch {
    return undefined
  }
}
export const isYouTubeChannelFeed = (value: string) =>
  !!channelIdFromFeedUrl(value)
export const isYouTubeUrl = (value: string) => {
  if (/^@[\w.-]+$/.test(value.trim())) return true
  try {
    return (
      /(^|\.)youtube\.com$/.test(
        new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
          .hostname
      ) ||
      new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
        .hostname === 'youtu.be'
    )
  } catch {
    return false
  }
}
export const isShortsLink = (url: string) => /\/shorts\//.test(url)
export const videoThumbnail = (id: string) =>
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`
export type YouTubeVideo = {
  id: string
  title: string
  description?: string
  url: string
  thumbnail: string
  publishedAt?: Date
}
export type YouTubeChannelMatch = {
  channelId: string
  feedUrl: string
  title: string
  handle?: string
  avatar?: string
  subscribers?: string
}
export type YouTubeChannel = YouTubeChannelMatch & {
  videos: YouTubeVideo[]
  uploadsPerWeek?: number
}
const match = (c: ChannelResource): YouTubeChannelMatch => ({
  channelId: c.id,
  feedUrl: channelFeedUrl(c.id),
  title: c.snippet.title,
  handle: c.snippet.customUrl,
  avatar: thumbnail(c.snippet.thumbnails),
})
export const resolveYouTubeChannel = async (
  value: string,
  videoCount = 3
): Promise<YouTubeChannel | undefined> => {
  let params: Record<string, string> | undefined
  if (value.trim().startsWith('@')) params = { forHandle: value.trim() }
  else {
    let u: URL
    try {
      u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    } catch {
      return undefined
    }
    if (!isYouTubeUrl(u.href)) return undefined
    const id =
      channelIdFromFeedUrl(u.href) ||
      u.pathname.match(/^\/channel\/(UC[\w-]{22})/)?.[1]
    const videoId = videoIdFromYouTubeUrl(u.href)
    if (id) params = { id }
    else if (videoId) {
      const video = (await videos([videoId]))[0]
      if (!video) return undefined
      params = { id: video.snippet.channelId }
    } else if (u.pathname.startsWith('/@'))
      params = { forHandle: u.pathname.split('/')[1] }
    else if (u.pathname.startsWith('/user/'))
      params = { forUsername: u.pathname.split('/')[2] }
    // Legacy /c/ URLs have no official resolver. Ask for the current @handle.
    else return undefined
  }
  const c = (
    await youtubeList<ChannelResource>('channels', {
      part: 'snippet,contentDetails',
      ...params,
    })
  ).items[0]
  if (!c) return undefined
  const playlistId = c.contentDetails?.relatedPlaylists?.uploads
  const items =
    videoCount && playlistId
      ? (
          await youtubeList<{
            contentDetails: { videoId: string; videoPublishedAt?: string }
            snippet: { title: string }
          }>('playlistItems', {
            part: 'snippet,contentDetails',
            playlistId,
            maxResults: Math.min(videoCount, 50),
          })
        ).items
      : []
  return {
    ...match(c),
    videos: items.map((v) => ({
      id: v.contentDetails.videoId,
      title: v.snippet.title,
      url: watchUrl(v.contentDetails.videoId),
      thumbnail: videoThumbnail(v.contentDetails.videoId),
      publishedAt: v.contentDetails.videoPublishedAt
        ? new Date(v.contentDetails.videoPublishedAt)
        : undefined,
    })),
  }
}
export const searchYouTubeChannels = async (query: string, limit = 6) =>
  (await searchChannels(query, limit)).map(match)
// Compatibility for older queued RSS jobs; new jobs use the official provider.
export const channelUploads = async (id: string) => {
  const channel = await resolveYouTubeChannel(channelFeedUrl(id), 50)
  return channel && { title: channel.title, uploads: channel.videos }
}
export const longFormVideoIds = async (
  _id: string
): Promise<Set<string> | undefined> => undefined
export type YouTubeTranscriptLine = {
  start: number
  duration: number
  text: string
}
// Public transcript extraction is deliberately retired. Preserve the old query
// shape for older clients without fetching or serving cached scraped captions.
export const getYouTubeTranscript = async (
  _videoId: string,
  _redis?: unknown
): Promise<YouTubeTranscriptLine[]> => []

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
  <meta property="og:description" content="${_.escape(
    args.description || ''
  )}" />
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
