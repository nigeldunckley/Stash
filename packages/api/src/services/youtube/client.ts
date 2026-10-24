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
}
export type ListResponse<T> = { items: T[]; nextPageToken?: string }
export const thumbnail = (images?: Record<string, Thumbnail>) =>
  images?.high?.url || images?.medium?.url || images?.default?.url
export const videoDuration = (video: VideoResource) =>
  durationSeconds(video.contentDetails.duration)
export const finishedVideo = (video: VideoResource) =>
  video.snippet.liveBroadcastContent !== 'live' &&
  video.snippet.liveBroadcastContent !== 'upcoming' &&
  (!video.liveStreamingDetails || !!video.liveStreamingDetails.actualEndTime)

export const configuredPublic = () => !!process.env.YOUTUBE_API_KEY

// Quotas are project-wide and reset at midnight Pacific Time. Redis makes the
// budget shared by API and workers; never log Axios errors containing credentials.
async function budget(search: boolean) {
  const redis = redisDataSource.redisClient
  if (!redis)
    throw new YouTubeUnavailableError(
      'YouTube sync needs Redis. Try again later.'
    )
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
  const key = `youtube:quota:${search ? 'search' : 'data'}:${day}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, 48 * 3600)
  const limit = Number(
    search
      ? process.env.YOUTUBE_SEARCH_DAILY_LIMIT || 100
      : process.env.YOUTUBE_DATA_DAILY_LIMIT || 10000
  )
  if (
    count > limit ||
    (await redis.exists(
      `youtube:exhausted:${search ? 'search' : 'data'}:${day}`
    ))
  )
    throw new YouTubeUnavailableError(
      'YouTube daily quota reached. Sync will resume after the quota resets.'
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
        const day = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Los_Angeles',
        }).format(new Date())
        await redisDataSource.redisClient?.set(
          `youtube:exhausted:${
            resource === 'search' ? 'search' : 'data'
          }:${day}`,
          '1',
          'EX',
          36 * 3600
        )
        throw new YouTubeUnavailableError(
          'YouTube daily quota reached. Sync will resume after the quota resets.'
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
          part: 'snippet,contentDetails,status,liveStreamingDetails',
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
  await redis?.set(key, JSON.stringify(found), 'EX', 3600)
  return found
}
