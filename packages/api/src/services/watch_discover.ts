// Watch › Discover: a front page of videos you might want to watch next,
// built by Stash rather than copied from YouTube.
//
// The videos you finish, save or highlight in Stash are the seeds. For each
// one Stash asks YouTube, without signing in, which videos it lists beside it
// ("Up next"). A video that turns up beside several seeds, or beside a seed you
// cared about a lot, ranks higher. Videos you already have and videos you said
// "Not for me" to are left out, and a channel you keep turning down fades.
// Every pick says which seed led to it.

import { SubscriptionType } from '../entity/subscription'
import { Subscription } from '../entity/subscription'
import { redisDataSource } from '../redis_data_source'
import { authTrx, getRepository } from '../repository'
import { logger } from '../utils/logger'
import { videoIdFromYouTubeUrl } from '../utils/youtube'
import {
  channelFeedUrl,
  channelIdFromFeedUrl,
  relatedYouTubeVideos,
  videoThumbnail,
  watchUrl,
  YouTubeRelatedVideo,
} from '../utils/youtubeChannel'

export type WatchDiscoverReasonKind =
  | 'finished'
  | 'highlighted'
  | 'saved'
  | 'watched'
  | 'channel'
  | 'many'

export type WatchDiscoverVideo = {
  videoId: string
  title: string
  url: string
  thumbnail: string
  duration?: number
  age?: string
  views?: number
  channelId?: string
  channelName?: string
  channelAvatar?: string
  // from a channel you follow, but not a video Stash has saved
  subscribed: boolean
  reason: string
  reasonKind: WatchDiscoverReasonKind
  score: number
}

export type WatchDiscoverChannel = {
  channelId: string
  name: string
  avatar?: string
  feedUrl: string
  videoCount: number
  reason: string
  sampleTitles: string[]
}

export type WatchDiscover = {
  picks: WatchDiscoverVideo[]
  channels: WatchDiscoverChannel[]
  builtAt: Date
  seeds: number
}

// How much each thing you did with a video says about wanting more like it.
const WEIGHTS: Record<Exclude<WatchDiscoverReasonKind, 'many'>, number> = {
  highlighted: 4,
  finished: 3,
  saved: 2,
  watched: 1.5,
  // a new video from a channel you follow that you haven't touched yet
  channel: 0.8,
}

const LOOKBACK_DAYS = 60
const MAX_SEEDS = 12
const MAX_PICKS = 30
const PER_CHANNEL = 2
const MAX_CHANNELS = 6
// YouTube is asked about this many seeds at once.
const CONCURRENCY = 3
// Shorter than this is a Short or a trailer, whatever YouTube calls it.
const MIN_SECONDS = 90
const CACHE_TTL = 3 * 60 * 60

type SeedRow = {
  id: string
  title: string
  url: string
  author: string | null
  subscription: string | null
  folder: string
  progress: number | null
  highlights: number
  touchedAt: Date
}

type Seed = {
  videoId: string
  title: string
  channelName?: string
  kind: Exclude<WatchDiscoverReasonKind, 'many'>
  weight: number
}

const videoIdOf = (url: string | null | undefined) => {
  try {
    return videoIdFromYouTubeUrl(url || undefined)
  } catch {
    return undefined
  }
}

const quoted = (title: string) =>
  `“${title.length > 60 ? `${title.slice(0, 57).trimEnd()}…` : title}”`

const seedKind = (row: SeedRow): Seed['kind'] => {
  if (row.highlights > 0) return 'highlighted'
  if ((row.progress ?? 0) >= 90) return 'finished'
  if (row.folder == 'inbox') return 'saved'
  if ((row.progress ?? 0) > 5) return 'watched'
  return 'channel'
}

// Recent videos you did something with count for more than old ones.
const recency = (touchedAt: Date, now: number) =>
  Math.pow(0.5, (now - new Date(touchedAt).getTime()) / (21 * 86400 * 1000))

const readSeeds = async (userId: string) =>
  authTrx(
    async (tx) => {
      const rows = (await tx.query(
        `SELECT li.id, li.title, li.original_url AS url, li.author,
                li.subscription, li.folder,
                li.reading_progress_bottom_percent AS progress,
                GREATEST(li.updated_at, li.saved_at) AS "touchedAt",
                (SELECT count(*) FROM omnivore.highlight h
                  WHERE h.library_item_id = li.id)::int AS highlights
         FROM omnivore.library_item li
         WHERE li.user_id = $1
           AND li.item_type = 'VIDEO'
           AND li.deleted_at IS NULL
           AND li.state <> 'DELETED'
           AND GREATEST(li.updated_at, li.saved_at) > NOW() - INTERVAL '${LOOKBACK_DAYS} days'
         ORDER BY GREATEST(li.updated_at, li.saved_at) DESC
         LIMIT 500`,
        [userId]
      )) as SeedRow[]
      // Every video Stash already has, so none is suggested again.
      const known = (await tx.query(
        `SELECT li.original_url AS url
         FROM omnivore.library_item li
         WHERE li.user_id = $1 AND li.item_type = 'VIDEO'
         ORDER BY li.saved_at DESC
         LIMIT 5000`,
        [userId]
      )) as { url: string }[]
      const dismissed = (await tx.query(
        `SELECT video_id AS "videoId", channel_id AS "channelId"
         FROM omnivore.watch_discover_dismissals
         WHERE user_id = $1`,
        [userId]
      )) as { videoId: string; channelId: string | null }[]
      return { rows, known, dismissed }
    },
    { uid: userId, replicationMode: 'replica' }
  )

export const pickSeeds = (rows: SeedRow[], now = Date.now()): Seed[] => {
  const seeds = rows
    .map((row) => {
      const videoId = videoIdOf(row.url)
      if (!videoId) return undefined
      const kind = seedKind(row)
      return {
        videoId,
        title: row.title,
        channelName: row.author || undefined,
        kind,
        weight: WEIGHTS[kind] * recency(row.touchedAt, now),
      }
    })
    .filter((seed): seed is Seed => !!seed)
    .sort((a, b) => b.weight - a.weight)

  // Untouched channel videos only fill in when there's too little else, and
  // never more than a third of the seeds.
  const engaged = seeds.filter((seed) => seed.kind != 'channel')
  const fill = seeds
    .filter((seed) => seed.kind == 'channel')
    .slice(0, Math.max(Math.floor(MAX_SEEDS / 3), MAX_SEEDS - engaged.length))
  return [...engaged, ...fill]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_SEEDS)
}

const reasonFor = (seed: Seed, contributors: number) => {
  if (contributors >= 3) {
    return { kind: 'many' as const, text: `Related to ${contributors} videos you watched` }
  }
  switch (seed.kind) {
    case 'highlighted':
      return { kind: seed.kind, text: `Because you highlighted ${quoted(seed.title)}` }
    case 'finished':
      return { kind: seed.kind, text: `Because you finished ${quoted(seed.title)}` }
    case 'saved':
      return { kind: seed.kind, text: `Because you saved ${quoted(seed.title)}` }
    case 'watched':
      return { kind: seed.kind, text: `Because you watched ${quoted(seed.title)}` }
    case 'channel':
      return {
        kind: seed.kind,
        text: seed.channelName
          ? `Often watched after ${seed.channelName}`
          : `Often watched after ${quoted(seed.title)}`,
      }
  }
}

type Candidate = {
  video: YouTubeRelatedVideo
  score: number
  // seed video ID → what it added
  from: Map<string, number>
}

// Ranks the videos YouTube listed beside each seed. Exported for tests.
export const rankCandidates = (
  seeds: Seed[],
  related: Map<string, YouTubeRelatedVideo[]>,
  options: {
    known: Set<string>
    dismissed: Set<string>
    // channel ID → how many of its videos you turned down
    channelDismissals: Map<string, number>
    subscribed: Set<string>
  }
): { picks: WatchDiscoverVideo[]; candidates: Candidate[] } => {
  const seedIds = new Set(seeds.map((seed) => seed.videoId))
  const candidates = new Map<string, Candidate>()
  for (const seed of seeds) {
    const list = related.get(seed.videoId) ?? []
    list.forEach((video, rank) => {
      if (
        seedIds.has(video.id) ||
        options.known.has(video.id) ||
        options.dismissed.has(video.id) ||
        (video.duration !== undefined && video.duration < MIN_SECONDS)
      ) {
        return
      }
      const turnedDown = video.channelId
        ? options.channelDismissals.get(video.channelId) ?? 0
        : 0
      // Twice "Not for me" from one channel and it stops being suggested.
      if (turnedDown >= 2) return
      const added =
        (seed.weight / (1 + rank * 0.15)) * (turnedDown == 1 ? 0.5 : 1)
      const candidate = candidates.get(video.id) ?? {
        video,
        score: 0,
        from: new Map(),
      }
      candidate.score += added
      candidate.from.set(seed.videoId, (candidate.from.get(seed.videoId) ?? 0) + added)
      candidates.set(video.id, candidate)
    })
  }

  const ranked = [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      // Turning up beside several seeds is the strongest sign of all.
      score: candidate.score * (1 + 0.3 * (candidate.from.size - 1)),
    }))
    .sort((a, b) => b.score - a.score)

  const perChannel = new Map<string, number>()
  const picks: WatchDiscoverVideo[] = []
  for (const candidate of ranked) {
    if (picks.length >= MAX_PICKS) break
    const { video } = candidate
    const channelKey = video.channelId || video.channelName || video.id
    const count = perChannel.get(channelKey) ?? 0
    if (count >= PER_CHANNEL) continue
    perChannel.set(channelKey, count + 1)

    const [topSeedId] = [...candidate.from.entries()].sort((a, b) => b[1] - a[1])[0]
    const seed = seeds.find((s) => s.videoId == topSeedId) as Seed
    const subscribed = !!video.channelId && options.subscribed.has(video.channelId)
    const reason = subscribed
      ? {
          kind: 'channel' as const,
          text: `From ${video.channelName || 'a channel you follow'}, one you haven’t seen`,
        }
      : reasonFor(seed, candidate.from.size)
    picks.push({
      videoId: video.id,
      title: video.title,
      url: watchUrl(video.id),
      thumbnail: videoThumbnail(video.id),
      duration: video.duration,
      age: video.age,
      views: video.views,
      channelId: video.channelId,
      channelName: video.channelName,
      channelAvatar: video.channelAvatar,
      subscribed,
      reason: reason.text,
      reasonKind: reason.kind,
      score: Math.round(candidate.score * 100) / 100,
    })
  }
  return { picks, candidates: ranked }
}

// Channels you don't follow whose videos keep turning up beside yours.
export const channelsToTry = (
  candidates: Candidate[],
  subscribed: Set<string>,
  channelDismissals: Map<string, number>
): WatchDiscoverChannel[] => {
  const channels = new Map<
    string,
    { name: string; avatar?: string; score: number; titles: string[] }
  >()
  for (const { video, score } of candidates) {
    if (!video.channelId || subscribed.has(video.channelId)) continue
    if ((channelDismissals.get(video.channelId) ?? 0) > 0) continue
    const channel = channels.get(video.channelId) ?? {
      name: video.channelName || video.channelId,
      avatar: video.channelAvatar,
      score: 0,
      titles: [],
    }
    channel.score += score
    channel.titles.push(video.title)
    channels.set(video.channelId, channel)
  }
  return [...channels.entries()]
    .filter(([, channel]) => channel.titles.length >= 2)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, MAX_CHANNELS)
    .map(([channelId, channel]) => ({
      channelId,
      name: channel.name,
      avatar: channel.avatar,
      feedUrl: channelFeedUrl(channelId),
      videoCount: channel.titles.length,
      reason: `${channel.titles.length} of its videos sit next to ones you watch`,
      sampleTitles: channel.titles.slice(0, 3),
    }))
}

const cacheKey = (userId: string) => `watch-discover:${userId}`

const subscribedChannels = async (userId: string) => {
  const subscriptions = await getRepository(Subscription).find({
    where: { user: { id: userId }, type: SubscriptionType.Rss },
  })
  return new Set(
    subscriptions
      .map((subscription) => channelIdFromFeedUrl(subscription.url || ''))
      .filter((id): id is string => !!id)
  )
}

// Videos saved since the page was built, which stop being picks straight
// away rather than when the page is next built.
const savedSince = async (userId: string, since: Date) => {
  const rows = (await authTrx(
    (tx) =>
      tx.query(
        `SELECT li.original_url AS url
         FROM omnivore.library_item li
         WHERE li.user_id = $1 AND li.item_type = 'VIDEO' AND li.saved_at >= $2`,
        [userId, since]
      ),
    { uid: userId }
  )) as { url: string }[]
  return new Set(
    rows.map((row) => videoIdOf(row.url)).filter((id): id is string => !!id)
  )
}

export const buildWatchDiscover = async (
  userId: string,
  refresh = false
): Promise<WatchDiscover> => {
  const redis = redisDataSource.redisClient ?? undefined
  if (!refresh) {
    const cached = await redis?.get(cacheKey(userId)).catch(() => null)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as WatchDiscover
        const builtAt = new Date(parsed.builtAt)
        const saved = await savedSince(userId, builtAt)
        return {
          ...parsed,
          picks: parsed.picks.filter((pick) => !saved.has(pick.videoId)),
          builtAt,
        }
      } catch {
        // Build it again below.
      }
    }
  }

  const [{ rows, known, dismissed }, subscribed] = await Promise.all([
    readSeeds(userId),
    subscribedChannels(userId),
  ])
  const seeds = pickSeeds(rows)

  const related = new Map<string, YouTubeRelatedVideo[]>()
  let failures = 0
  for (let i = 0; i < seeds.length; i += CONCURRENCY) {
    await Promise.all(
      seeds.slice(i, i + CONCURRENCY).map(async (seed) => {
        try {
          related.set(seed.videoId, await relatedYouTubeVideos(seed.videoId, redis))
        } catch {
          failures++
        }
      })
    )
  }
  if (seeds.length && failures == seeds.length) {
    logger.info('watch discover: YouTube did not answer for any seed', { userId })
  }

  const channelDismissals = new Map<string, number>()
  for (const row of dismissed) {
    if (row.channelId) {
      channelDismissals.set(row.channelId, (channelDismissals.get(row.channelId) ?? 0) + 1)
    }
  }
  const { picks, candidates } = rankCandidates(seeds, related, {
    known: new Set(known.map((row) => videoIdOf(row.url)).filter((id): id is string => !!id)),
    dismissed: new Set(dismissed.map((row) => row.videoId)),
    channelDismissals,
    subscribed,
  })
  const result: WatchDiscover = {
    picks,
    channels: channelsToTry(candidates, subscribed, channelDismissals),
    builtAt: new Date(),
    seeds: seeds.length,
  }
  // An empty page because YouTube didn't answer isn't kept, so the next visit
  // tries again.
  if (picks.length || !seeds.length) {
    await redis
      ?.set(cacheKey(userId), JSON.stringify(result), 'EX', CACHE_TTL)
      .catch(() => undefined)
  }
  return result
}

// "Not for me" on a pick, or taking it back.
export const dismissWatchDiscoverVideo = async (
  userId: string,
  videoId: string,
  channelId: string | undefined,
  restore: boolean
) => {
  await authTrx(
    (tx) =>
      restore
        ? tx.query(
            `DELETE FROM omnivore.watch_discover_dismissals
             WHERE user_id = $1 AND video_id = $2`,
            [userId, videoId]
          )
        : tx.query(
            `INSERT INTO omnivore.watch_discover_dismissals (user_id, video_id, channel_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, video_id) DO NOTHING`,
            [userId, videoId, channelId ?? null]
          ),
    { uid: userId }
  )
  // The kept page is changed in place, so the next visit doesn't ask YouTube
  // again just to drop one video.
  const redis = redisDataSource.redisClient
  const cached = await redis?.get(cacheKey(userId)).catch(() => null)
  if (!cached || restore) {
    if (restore) await redis?.del(cacheKey(userId)).catch(() => undefined)
    return
  }
  try {
    const page = JSON.parse(cached) as WatchDiscover
    page.picks = page.picks.filter((pick) => pick.videoId != videoId)
    await redis
      ?.set(cacheKey(userId), JSON.stringify(page), 'KEEPTTL')
      .catch(() => undefined)
  } catch {
    await redis?.del(cacheKey(userId)).catch(() => undefined)
  }
}

