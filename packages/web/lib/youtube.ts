// Helpers for YouTube channels in Feeds and the videos they bring in.

import { PageType } from './networking/fragments/articleFragment'

// A channel is followed through its feed of uploads.
// The channel's page on YouTube, for a channel feed address.
export const channelPageUrl = (
  feedUrl: string | undefined
): string | undefined => {
  if (!feedUrl) return undefined
  try {
    const id = new URL(feedUrl).searchParams.get('channel_id')
    return id ? `https://www.youtube.com/channel/${id}` : undefined
  } catch {
    return undefined
  }
}

export const isYouTubeFeedUrl = (url: string | undefined): boolean => {
  if (!url) {
    return false
  }
  try {
    const parsed = new URL(url)
    return (
      parsed.hostname.endsWith('youtube.com') &&
      parsed.pathname == '/feeds/videos.xml' &&
      parsed.searchParams.has('channel_id')
    )
  } catch {
    return false
  }
}

export const looksLikeYouTube = (value: string): boolean => {
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

export const videoIdFromUrl = (url: string | undefined): string | undefined => {
  if (!url) {
    return undefined
  }
  try {
    const parsed = new URL(url)
    if (parsed.hostname == 'youtu.be') {
      return parsed.pathname.slice(1, 12) || undefined
    }
    if (!parsed.hostname.endsWith('youtube.com')) {
      return undefined
    }
    return (
      parsed.searchParams.get('v') ||
      parsed.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1] ||
      undefined
    )
  } catch {
    return undefined
  }
}

type VideoLike = {
  pageType?: PageType | string
  originalArticleUrl?: string
  url?: string
}

// Items from channels, and any YouTube link saved elsewhere.
export const isVideoItem = (item: VideoLike): boolean =>
  item.pageType == 'VIDEO' ||
  !!videoIdFromUrl(item.originalArticleUrl || item.url)

export const isShortsUrl = (url: string | undefined) =>
  !!url && /youtube\.com\/shorts\//.test(url)

// The video job records a video's length as a word count at 3.92 words a
// second, so its reading time matches its running time.
const WORDS_PER_SECOND = 3.92

export const videoSeconds = (wordsCount: number | undefined) =>
  wordsCount && wordsCount > 0
    ? Math.round(wordsCount / WORDS_PER_SECOND)
    : undefined

// 754 -> "12:34", 3723 -> "1:02:03".
export const formatTimecode = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export type Chapter = { start: number; title: string }

const TIMECODE = /^\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:|·.]?\s*(.+)$/

const toSeconds = (timecode: string) =>
  timecode
    .split(':')
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0)

// YouTube makes chapters from description lines that start with a timecode,
// beginning at 0:00 with at least three in order. The same rule applies here.
export const chaptersFromDescription = (
  description: string | undefined
): Chapter[] => {
  if (!description) {
    return []
  }
  const chapters: Chapter[] = []
  for (const line of description.split('\n')) {
    const match = line.trim().match(TIMECODE)
    if (!match) continue
    const start = toSeconds(match[1])
    const previous = chapters[chapters.length - 1]
    if (previous && start <= previous.start) continue
    chapters.push({ start, title: match[2].trim() })
  }
  if (chapters.length < 3 || chapters[0].start != 0) {
    return []
  }
  return chapters
}

// The description without its chapter list, for the About tab.
export const descriptionWithoutChapters = (
  description: string | undefined
): string =>
  (description ?? '')
    .split('\n')
    .filter((line) => !TIMECODE.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

// Today, Yesterday, This week, then month names, for grouping videos.
export const dayGroup = (date: string | undefined, now = new Date()) => {
  if (!date) {
    return 'Earlier'
  }
  const then = new Date(date)
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime()
  const day = 24 * 60 * 60 * 1000
  if (then.getTime() >= startOfToday) return 'Today'
  if (then.getTime() >= startOfToday - day) return 'Yesterday'
  if (then.getTime() >= startOfToday - 6 * day) return 'This week'
  return then.toLocaleDateString(undefined, {
    month: 'long',
    year: then.getFullYear() == now.getFullYear() ? undefined : 'numeric',
  })
}
