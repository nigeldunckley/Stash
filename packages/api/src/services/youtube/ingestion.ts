import axios from 'axios'
import { randomBytes } from 'crypto'
import { appDataSource } from '../../data_source'
import { LibraryItem } from '../../entity/library_item'
import { Subscription, SubscriptionStatus } from '../../entity/subscription'
import { env } from '../../env'
import { redisDataSource } from '../../redis_data_source'
import { clearCachedReadingPosition } from '../cached_reading_position'
import { hasFeedItem, updateLibraryItem } from '../library_item'
import { savePage } from '../save_page'
import { findActiveUser } from '../user'
import {
  channelFeedUrl,
  videoDocument,
  watchUrl,
} from '../../utils/youtubeChannel'
import { logger } from '../../utils/logger'
import {
  channels,
  ChannelResource,
  configuredPublic,
  finishedVideo,
  thumbnail,
  VideoResource,
  videoDuration,
  videos,
  youtubeList,
} from './client'
import { queueYouTube } from './connection'
import { shouldImportVideo } from './security'

type ChannelState = {
  channel_id: string
  data: ChannelResource
  fetched_at: Date
  lease_expires_at?: Date
  hub_token?: string
  hub_secret?: string
  hub_requested_at?: Date
}
export async function cacheVideos(items: VideoResource[]) {
  for (const v of items)
    await appDataSource.query(
      `INSERT INTO omnivore.youtube_videos(video_id,channel_id,data) VALUES($1,$2,$3) ON CONFLICT(video_id) DO UPDATE SET data=excluded.data,fetched_at=now()`,
      [v.id, v.snippet.channelId, JSON.stringify(v)]
    )
}
export async function publicVideo(id: string) {
  const rows = (await appDataSource.query(
    "SELECT data FROM omnivore.youtube_videos WHERE video_id=$1 AND fetched_at > now()-interval '1 day'",
    [id]
  )) as { data: VideoResource }[]
  if (rows[0]) return rows[0].data
  const item = (await videos([id]))[0]
  if (item) await cacheVideos([item])
  else
    await appDataSource.query(
      'DELETE FROM omnivore.youtube_videos WHERE video_id=$1',
      [id]
    )
  return item
}
export const playbackFlags = (v?: VideoResource) => ({
  youtubeAvailable: !!v,
  youtubeEmbeddable: v?.status.embeddable === true,
  youtubeMadeForKids: v?.status.madeForKids ?? true,
  youtubeMetadataAt: new Date(),
})

async function updateVideoCopies(id: string, v?: VideoResource) {
  // Public metadata updates never replace user-created notes, labels or progress.
  const items = await appDataSource
    .getRepository(LibraryItem)
    .find({ where: { originalUrl: watchUrl(id) } })
  for (const item of items) {
    await updateLibraryItem(
      item.id,
      {
        ...playbackFlags(v),
        ...(v
          ? {
              title: v.snippet.title,
              author: v.snippet.channelTitle,
              description: v.snippet.description || '',
              publishedAt: new Date(v.snippet.publishedAt),
              thumbnail: thumbnail(v.snippet.thumbnails),
              readableContent: videoDocument({
                videoId: v.id,
                title: v.snippet.title,
                channel: v.snippet.channelTitle,
                channelUrl: `https://www.youtube.com/channel/${v.snippet.channelId}`,
                description: v.snippet.description,
              }),
              wordCount: Math.round(videoDuration(v) * 3.92),
            }
          : {
              title: 'Unavailable YouTube video',
              author: null,
              description: null,
              thumbnail: null,
              readableContent: `<p><a href="${watchUrl(
                id
              )}">Open on YouTube</a></p>`,
              wordCount: 0,
            }),
      },
      item.userId
    )
    if (v?.status.madeForKids !== false) {
      await clearCachedReadingPosition(item.userId, item.id)
      await appDataSource.query(
        'UPDATE omnivore.library_item SET reading_progress_last_read_anchor=0,reading_progress_highest_read_anchor=0,reading_progress_top_percent=0,reading_progress_bottom_percent=0 WHERE id=$1',
        [item.id]
      )
    }
  }
}
async function importForSubscription(
  s: Subscription,
  items: VideoResource[],
  startedAt: Date,
  reconciliation: boolean
) {
  const uid = s.user?.id
  if (!uid || s.status !== SubscriptionStatus.Active || s.youtubeExcluded)
    return
  const since = s.youtubeInitializedAt
    ? (s.youtubeCheckpointAt || s.youtubeInitializedAt).getTime()
    : startedAt.getTime() - 7 * 86400000
  const user = await findActiveUser(uid)
  if (!user) return
  let newest = s.mostRecentItemDate?.getTime() || since
  for (const v of [...items].sort((a, b) =>
    a.snippet.publishedAt.localeCompare(b.snippet.publishedAt)
  )) {
    const published = Date.parse(v.snippet.publishedAt)
    if (
      (published < since && !v.liveStreamingDetails?.actualEndTime) ||
      !finishedVideo(v)
    )
      continue
    // Recheck the source before every save: a disconnect/unfollow can happen
    // while Google is answering or another subscriber is being processed.
    const current = await appDataSource
      .getRepository(Subscription)
      .findOneBy({ id: s.id, user: { id: uid } })
    if (
      !current ||
      current.status !== SubscriptionStatus.Active ||
      current.youtubeExcluded
    )
      return
    if (
      shouldImportVideo(videoDuration(v), current.hideShortVideos) &&
      !(await hasFeedItem(
        uid,
        s.url || channelFeedUrl(v.snippet.channelId),
        watchUrl(v.id)
      ))
    ) {
      const result = await savePage(
        {
          url: watchUrl(v.id),
          title: v.snippet.title,
          author: v.snippet.channelTitle,
          folder: 'following',
          rssFeedUrl: s.url || channelFeedUrl(v.snippet.channelId),
          savedAt: v.snippet.publishedAt,
          publishedAt: v.snippet.publishedAt,
          previewImage: thumbnail(v.snippet.thumbnails),
          wordCount: Math.round(videoDuration(v) * 3.92),
          originalContent: videoDocument({
            videoId: v.id,
            title: v.snippet.title,
            channel: v.snippet.channelTitle,
            channelUrl: `https://www.youtube.com/channel/${v.snippet.channelId}`,
            description: v.snippet.description,
          }),
          source: 'rss-feeder',
          clientRequestId: '',
          labels: [{ name: 'RSS' }],
        },
        user
      )
      if (result.__typename === 'SaveError')
        throw new Error(
          'Could not save YouTube video; checkpoint retained for retry'
        )
    }
    newest = Math.max(newest, published)
    await updateVideoCopies(v.id, v)
  }
  await appDataSource.getRepository(Subscription).update(
    { id: s.id, user: { id: uid }, status: SubscriptionStatus.Active },
    {
      youtubeInitializedAt: s.youtubeInitializedAt || startedAt,
      ...(reconciliation ? { youtubeCheckpointAt: startedAt } : {}),
      mostRecentItemDate: new Date(newest),
      refreshedAt: new Date(),
      failedAt: null,
    }
  )
}

export async function refreshChannel(
  channelId: string,
  notificationVideoId?: string
) {
  if (!configuredPublic() || !/^UC[\w-]{22}$/.test(channelId)) return
  const redis = redisDataSource.redisClient
  const lock = randomBytes(16).toString('hex')
  if (
    !redis ||
    !(await redis.set(
      `youtube:channel-lock:${channelId}`,
      lock,
      'EX',
      900,
      'NX'
    ))
  )
    throw new Error('YouTube channel is already being refreshed')
  try {
    const subscribers = await appDataSource.getRepository(Subscription).find({
      where: {
        youtubeChannelId: channelId,
        status: SubscriptionStatus.Active,
        youtubeExcluded: false,
      },
      relations: ['user'],
    })
    if (!subscribers.length) return
    const startedAt = new Date()
    const channel = (await channels([channelId]))[0]
    if (!channel) return
    await appDataSource.query(
      `INSERT INTO omnivore.youtube_channels(channel_id,data) VALUES($1,$2) ON CONFLICT(channel_id) DO UPDATE SET data=excluded.data,fetched_at=now()`,
      [channelId, JSON.stringify(channel)]
    )
    let found: VideoResource[] = []
    const reconciliation =
      !notificationVideoId || subscribers.some((s) => !s.youtubeInitializedAt)
    if (notificationVideoId && !reconciliation) {
      const response = await videos([notificationVideoId])
      found = response.filter((v) => v.snippet.channelId === channelId)
      if (!found.length) {
        const known = (await appDataSource.query(
          'SELECT channel_id FROM omnivore.youtube_videos WHERE video_id=$1',
          [notificationVideoId]
        )) as { channel_id: string }[]
        if (!response.length && known[0]?.channel_id === channelId) {
          await updateVideoCopies(notificationVideoId)
          await appDataSource.query(
            'DELETE FROM omnivore.youtube_videos WHERE video_id=$1',
            [notificationVideoId]
          )
        }
        return
      }
    } else {
      const since = Math.min(
        ...subscribers.map((s) =>
          s.youtubeInitializedAt
            ? (s.youtubeCheckpointAt || s.youtubeInitializedAt).getTime()
            : startedAt.getTime() - 7 * 86400000
        )
      )
      const playlistId = channel.contentDetails?.relatedPlaylists?.uploads
      if (!playlistId) return
      let pageToken: string | undefined
      const visited = new Set<string>()
      const ids = new Set<string>()
      do {
        if (pageToken && visited.has(pageToken))
          throw new Error('Repeated YouTube page token')
        if (pageToken) visited.add(pageToken)
        const page = await youtubeList<{
          contentDetails: { videoId: string; videoPublishedAt?: string }
        }>('playlistItems', {
          part: 'contentDetails',
          playlistId,
          maxResults: 50,
          pageToken,
        })
        let crossed = false
        for (const item of page.items) {
          if (
            item.contentDetails.videoPublishedAt &&
            Date.parse(item.contentDetails.videoPublishedAt) < since
          ) {
            crossed = true
            continue
          }
          ids.add(item.contentDetails.videoId)
        }
        pageToken = crossed ? undefined : page.nextPageToken
        if ((await redis.get(`youtube:channel-lock:${channelId}`)) !== lock)
          throw new Error('Channel lease expired')
      } while (pageToken)
      // Upcoming broadcasts stay pending even after the upload checkpoint moves.
      const pending = (await appDataSource.query(
        `SELECT video_id FROM omnivore.youtube_videos WHERE channel_id=$1 AND (data->'snippet'->>'liveBroadcastContent' IN ('live','upcoming'))`,
        [channelId]
      )) as { video_id: string }[]
      pending.forEach((v) => ids.add(v.video_id))
      found = (await videos([...ids])).filter(
        (v) => v.snippet.channelId === channelId
      )
    }
    await cacheVideos(found)
    for (const s of subscribers)
      await importForSubscription(s, found, startedAt, reconciliation)
    // Metadata-change notifications may concern older videos, outside ingestion's
    // checkpoint. Update existing copies regardless of whether they are new.
    for (const v of found) await updateVideoCopies(v.id, v)
    if (reconciliation)
      await appDataSource.query(
        'UPDATE omnivore.youtube_channels SET reconciled_at=now() WHERE channel_id=$1',
        [channelId]
      )
    await renewPush(channelId)
  } finally {
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      `youtube:channel-lock:${channelId}`,
      lock
    )
  }
}

export async function renewPush(channelId: string, unsubscribe = false) {
  const row = (
    (await appDataSource.query(
      'SELECT * FROM omnivore.youtube_channels WHERE channel_id=$1',
      [channelId]
    )) as ChannelState[]
  )[0]
  if (
    !row ||
    (row.hub_requested_at &&
      row.hub_requested_at.getTime() > Date.now() - 3600000) ||
    (!unsubscribe &&
      row.lease_expires_at &&
      row.lease_expires_at.getTime() > Date.now() + 86400000)
  )
    return
  const token = row.hub_token || randomBytes(24).toString('hex'),
    secret = row.hub_secret || randomBytes(32).toString('hex')
  await appDataSource.query(
    'UPDATE omnivore.youtube_channels SET hub_token=$2,hub_secret=$3,hub_requested_at=now() WHERE channel_id=$1',
    [channelId, token, secret]
  )
  const callback = `${(
    process.env.YOUTUBE_PUBLIC_URL || env.client.url
  ).replace(/\/$/, '')}/api/youtube/push/${channelId}/${token}`
  const body = new URLSearchParams({
    'hub.mode': unsubscribe ? 'unsubscribe' : 'subscribe',
    'hub.topic': `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`,
    'hub.callback': callback,
    'hub.verify': 'async',
    'hub.secret': secret,
    'hub.lease_seconds': '432000',
  })
  try {
    await axios.post(
      'https://pubsubhubbub.appspot.com/subscribe',
      body.toString(),
      {
        timeout: 15000,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }
    )
  } catch {
    logger.warning(
      'YouTube push renewal failed; scheduled reconciliation remains active',
      { channelId }
    )
  }
}

export async function youtubeMaintenance() {
  await expireMetadata()
  if (!configuredPublic()) return
  const connections = (await appDataSource.query(
    `SELECT user_id FROM omnivore.youtube_connections WHERE credentials<>'' AND (synced_at IS NULL OR synced_at<now()-interval '1 hour')`
  )) as { user_id: string }[]
  for (const c of connections)
    await queueYouTube('youtube-sync-user', { userId: c.user_id }, c.user_id)
  const due = (await appDataSource.query(
    `SELECT DISTINCT s.youtube_channel_id AS id FROM omnivore.subscriptions s LEFT JOIN omnivore.youtube_channels c ON c.channel_id=s.youtube_channel_id WHERE s.status='ACTIVE' AND NOT s.youtube_excluded AND s.youtube_channel_id IS NOT NULL AND (s.youtube_initialized_at IS NULL OR c.reconciled_at IS NULL OR c.reconciled_at<now()-interval '6 hours')`
  )) as { id: string }[]
  for (const c of due)
    await queueYouTube('youtube-refresh-channel', { channelId: c.id }, c.id)
  const renewals = (await appDataSource.query(
    `SELECT channel_id FROM omnivore.youtube_channels c WHERE (lease_expires_at IS NULL OR lease_expires_at<now()+interval '1 day') AND (hub_requested_at IS NULL OR hub_requested_at<now()-interval '1 hour') AND EXISTS(SELECT 1 FROM omnivore.subscriptions s WHERE s.youtube_channel_id=c.channel_id AND s.status='ACTIVE' AND NOT s.youtube_excluded)`
  )) as { channel_id: string }[]
  for (const c of renewals)
    await queueYouTube(
      'youtube-renew-push',
      { channelId: c.channel_id },
      c.channel_id
    )
  const unused = (await appDataSource.query(
    `SELECT channel_id FROM omnivore.youtube_channels c WHERE lease_expires_at>now() AND NOT EXISTS(SELECT 1 FROM omnivore.subscriptions s WHERE s.youtube_channel_id=c.channel_id AND s.status='ACTIVE' AND NOT s.youtube_excluded)`
  )) as { channel_id: string }[]
  for (const c of unused) await renewPush(c.channel_id, true)
  const legacy = (await appDataSource.query(
    `SELECT id,user_id FROM omnivore.library_item WHERE original_url ~ '^https://(www\\.)?(youtube\\.com/watch\\?v=|youtu\\.be/)' AND youtube_metadata_at IS NULL AND state<>'DELETED' LIMIT 100`
  )) as { id: string; user_id: string }[]
  for (const item of legacy)
    await queueYouTube(
      'process-youtube-video',
      { libraryItemId: item.id, userId: item.user_id },
      item.id
    )
  const staleChannels = (await appDataSource.query(
    "SELECT channel_id FROM omnivore.youtube_channels WHERE fetched_at<now()-interval '27 days' LIMIT 50"
  )) as { channel_id: string }[]
  if (staleChannels.length) {
    const updated = await channels(staleChannels.map((c) => c.channel_id))
    for (const c of updated)
      await appDataSource.query(
        'UPDATE omnivore.youtube_channels SET data=$2,fetched_at=now() WHERE channel_id=$1',
        [c.id, JSON.stringify(c)]
      )
    for (const c of staleChannels.filter(
      (old) => !updated.some((v) => v.id === old.channel_id)
    ))
      await appDataSource.query(
        "UPDATE omnivore.youtube_channels SET data='{}',fetched_at=now() WHERE channel_id=$1",
        [c.channel_id]
      )
  }
  // Refresh retained public video metadata before the 30-day retention deadline.
  const stale = (await appDataSource.query(
    `SELECT video_id FROM omnivore.youtube_videos WHERE fetched_at<now()-interval '27 days' ORDER BY fetched_at LIMIT 100`
  )) as { video_id: string }[]
  for (let start = 0; start < stale.length; start += 50) {
    const batch = stale.slice(start, start + 50).map((v) => v.video_id)
    const current = await videos(batch)
    await cacheVideos(current)
    for (const id of batch) {
      await updateVideoCopies(
        id,
        current.find((v) => v.id === id)
      )
      if (!current.some((v) => v.id === id))
        await appDataSource.query(
          'DELETE FROM omnivore.youtube_videos WHERE video_id=$1',
          [id]
        )
    }
  }
  // Expired API data must not linger indefinitely if quota prevents a refresh.
  await appDataSource.query(
    "DELETE FROM omnivore.youtube_videos WHERE fetched_at<now()-interval '30 days'"
  )
}

async function expireMetadata() {
  await appDataSource.query(`UPDATE omnivore.library_item SET title='YouTube video',author=NULL,description=NULL,thumbnail=NULL,word_count=0,
    readable_content='<p>YouTube metadata expired. Open the original video on YouTube.</p>',youtube_available=NULL,youtube_embeddable=NULL,youtube_made_for_kids=NULL
    WHERE youtube_metadata_at<now()-interval '30 days'`)
  await appDataSource.query(
    "DELETE FROM omnivore.youtube_videos WHERE fetched_at<now()-interval '30 days'"
  )
  await appDataSource.query(
    "UPDATE omnivore.youtube_channels SET data='{}' WHERE fetched_at<now()-interval '30 days'"
  )
}
