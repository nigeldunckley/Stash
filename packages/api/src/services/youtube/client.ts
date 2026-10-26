import axios from 'axios'
import { createHash } from 'crypto'
import { redisDataSource } from '../../redis_data_source'
import { durationSeconds } from './security'

export class YouTubeUnavailableError extends Error {}
export type Thumbnail = { url?: string }
export type ChannelResource = {
  id: string
  snippet: {
    title: string
    description?: string
    customUrl?: string
    thumbnails?: Record<string, Thumbnail>
  }
  contentDetails?: { relatedPlaylists?: { uploads?: string } }
}
export type VideoResource = {
  id: string
  snippet: {
    title: string
    channelId: string
    channelTitle: string
    description?: string
    publishedAt: string
    liveBroadcastContent?: string
    thumbnails?: Record<string, Thumbnail>
  }
  contentDetails: {
    duration: string
    regionRestriction?: { allowed?: string[]; blocked?: string[] }
  }
  status: {
    embeddable?: boolean
    madeForKids?: boolean
    privacyStatus?: string
    uploadStatus?: string
  }
  liveStreamingDetails?: { actualEndTime?: string; scheduledStartTime?: string }
  // Sized to the video's shape when YouTube knows it (videos() asks for this).
  player?: { embedWidth?: string | number; embedHeight?: string | number }
}
export type ListResponse<T> = { items: T[]; nextPageToken?: string }
export const thumbnail = (images?: Record<string, Thumbnail>) =>
  images?.high?.url || images?.medium?.url || images?.default?.url
export const videoDuration = (video: VideoResource) =>
  durationSeconds(video.contentDetails.duration)
// YouTube's API has no Shorts flag. A Short is at most three minutes long and
// vertical or square (its embed is at least as tall as wide), or tagged #shorts when YouTube
// doesn't know its shape.
export const isShortVideo = (video: VideoResource) => {
  const seconds = videoDuration(video)
  if (seconds <= 0 || seconds > 180) return false
  const width = Number(video.player?.embedWidth)
  const height = Number(video.player?.embedHeight)
  if (width > 0 && height > 0) return height >= width
  return /#shorts\b/i.test(
    `${video.snippet.title} ${video.snippet.description || ''}`
  )
}
export const finishedVideo = (video: VideoResource) =>
  video.snippet.liveBroadcastContent !== 'live' &&
  video.snippet.liveBroadcastContent !== 'upcoming' &&
  (!video.liveStreamingDetails || !!video.liveStreamingDetails.actualEndTime)

export const configuredPublic = () => !!process.env.YOUTUBE_API_KEY

// Shown in Settings › YouTube. New videos keep arriving from channel feeds,
// which cost nothing; only the extra details and subscription sync wait.
export const QUOTA_MESSAGE =
  "YouTube's daily quota for this server is used up. New videos still arrive from channel feeds; video details and subscription changes catch up after it resets at midnight Pacific time."

const pacificDay = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())

// Quotas are project-wide and reset at midnight Pacific Time. Redis makes the
// budget shared by API and workers; never log Axios errors containing credentials.
// Google's daily quota is 10,000 units: most calls cost 1, a search costs 100,
// so the defaults leave searches a fifth of it and stop other calls short of
// the rest.
async function budget(search: boolean) {
  const redis = redisDataSource.redisClient
  if (!redis)
    throw new YouTubeUnavailableError(
      'YouTube sync needs Redis. Try again later.'
    )
  const day = pacificDay()
  const key = `youtube:quota:${search ? 'search' : 'data'}:${day}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, 48 * 3600)
  const limit = Number(
    search
      ? process.env.YOUTUBE_SEARCH_DAILY_LIMIT || 20
      : process.env.YOUTUBE_DATA_DAILY_LIMIT || 7500
  )
  if (
    count > limit ||
    (await redis.exists(
      `youtube:exhausted:${search ? 'search' : 'data'}:${day}`
    ))
  )
    throw new YouTubeUnavailableError(
      QUOTA_MESSAGE
    )
}

export async function youtubeList<T>(
  resource: string,
  params: Record<string, string | number | boolean | undefined>,
  accessToken?: string
): Promise<ListResponse<T>> {
  if (!accessToken && !configuredPublic())
    throw new YouTubeUnavailableError(
      'YouTube is not configured on this Stash server.'
    )
  for (let attempt = 0; attempt < 3; attempt++) {
    await budget(resource === 'search')
    try {
      const result = await axios.get<ListResponse<T>>(
        `https://www.googleapis.com/youtube/v3/${resource}`,
        {
          params: {
            ...params,
            key: accessToken ? undefined : process.env.YOUTUBE_API_KEY,
          },
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
          timeout: 15000,
        }
      )
      return {
        items: result.data.items || [],
        nextPageToken: result.data.nextPageToken,
      }
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined
      const reason = axios.isAxiosError(error)
        ? (error.response?.data?.error?.errors?.[0]?.reason as
            | string
            | undefined)
        : undefined
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
        // Searches and other calls draw on the same project quota.
        const day = pacificDay()
        for (const kind of ['search', 'data'])
          await redisDataSource.redisClient?.set(
            `youtube:exhausted:${kind}:${day}`,
            '1',
            'EX',
            36 * 3600
          )
        throw new YouTubeUnavailableError(
          QUOTA_MESSAGE
        )
      }
      if (status === 401) throw new YouTubeUnavailableError('YOUTUBE_RECONNECT')
      if (status === 429 || !status || status >= 500) {
        if (attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 300 * 2 ** attempt)
          )
          continue
        }
      }
      throw new YouTubeUnavailableError(
        status === 403
          ? 'YouTube denied access. Check the connection and API configuration.'
          : 'YouTube could not be reached. Try again later.'
      )
    }
  }
  throw new YouTubeUnavailableError(
    'YouTube could not be reached. Try again later.'
  )
}

export async function channels(ids: string[]): Promise<ChannelResource[]> {
  const result: ChannelResource[] = []
  for (let start = 0; start < ids.length; start += 50) {
    result.push(
      ...(
        await youtubeList<ChannelResource>('channels', {
          part: 'snippet,contentDetails',
          id: ids.slice(start, start + 50).join(','),
        })
      ).items
    )
  }
  return result
}

export async function videos(ids: string[]): Promise<VideoResource[]> {
  const result: VideoResource[] = []
  for (let start = 0; start < ids.length; start += 50) {
    result.push(
      ...(
        await youtubeList<VideoResource>('videos', {
          part: 'snippet,contentDetails,status,liveStreamingDetails,player',
          // Any size makes YouTube report the embed's shape (see isShortVideo).
          maxWidth: 1000,
          id: ids.slice(start, start + 50).join(','),
        })
      ).items
    )
  }
  return result
}

export async function searchChannels(
  query: string,
  count: number
): Promise<ChannelResource[]> {
  const redis = redisDataSource.redisClient
  const key = `youtube:search:${createHash('sha256')
    .update(query.trim().toLowerCase())
    .digest('hex')}`
  const cached = await redis?.get(key)
  if (cached) return (JSON.parse(cached) as ChannelResource[]).slice(0, count)
  const result = await youtubeList<{ id: { channelId: string } }>('search', {
    part: 'snippet',
    type: 'channel',
    q: query,
    maxResults: Math.min(count, 50),
  })
  const found = result.items.length
    ? await channels(result.items.map((v) => v.id.channelId))
    : []
  // A search costs a hundred times a normal call, so answers keep for a day.
  await redis?.set(key, JSON.stringify(found), 'EX', 24 * 3600)
  return found
}
