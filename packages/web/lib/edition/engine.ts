// The Edition: a front page Stash lays out once a day from new feed items,
// your saved queue and new videos. This file holds the ranking engine. It is
// pure (no network), so the same inputs always make the same edition.
//
// Each candidate gets five signals, each between 0 and 1:
// - relevance: how close its words are to what you read, save and
//   highlight (your reading history over the last two months)
// - affinity: how often you read what this feed or site sends you
// - popularity: points on Hacker News, or the same story arriving from
//   several of your feeds
// - freshness: how recently it was published
// - quality: has a header image, a summary and some length
// The overall score mixes them; each section then picks by its own signal.

import { State } from '../networking/fragments/articleFragment'
import type { LibraryItemNode } from '../networking/library_items/useLibraryItems'
import { readingMinutes } from '../readingTime'

export type EditionSlot = 'lead' | 'pick' | 'popular' | 'brief' | 'watch'

export type EditionEntry = {
  id: string
  slot: EditionSlot
  // A short reason it was chosen, e.g. "412 points on Hacker News".
  why?: string
}

export type Edition = {
  // The morning the edition belongs to, as a local yyyy-mm-dd date.
  date: string
  number: number
  builtAt: string
  entries: EditionEntry[]
  skipped: string[]
  // How much there was to choose from, for the masthead.
  considered: number
  sources: number
}

// Points and comments an item collected elsewhere, keyed by item id.
export type Buzz = { points: number; comments: number; where: string }

export type BuildInput = {
  now: Date
  date: string
  number: number
  // New feed items and saved, unread articles that could go in.
  candidates: LibraryItemNode[]
  videos: LibraryItemNode[]
  // Recent items with what you did with them, to learn from.
  history: LibraryItemNode[]
  // Items skipped in earlier editions count against their feed.
  skipped: Set<string>
  // Items featured in earlier editions, which are not repeated.
  featured: Set<string>
  buzz?: Map<string, Buzz>
  sourceName: (item: LibraryItemNode) => string
}

const READING_BUDGET_MINUTES = 60
const QUEUE_LIMIT = 3

const STOP_WORDS = new Set(
  `the and for with that this from your you are was were have has had not but
  what when where who why how all any can will just than then them they their
  there these those into over under about after before more most some such
  only own same other our out its it's his her him she he new now one two
  three get got also been being does did doing would could should may might
  very much many make made like via per using use used here off yet still
  even ever every each both few lot lots way ways thing things time times
  year years day days week weeks today why's how's what's don't can't won't
  i'm we're they're you're isn't aren't didn't doesn't let's says said say
  first last best good great big little long short high low part show
  video episode podcast newsletter issue edition read reading article post`
    .split(/\s+/)
    .filter(Boolean)
)

// Lower-case words worth matching on, with a light plural stem.
export const wordsOf = (text: string | undefined): string[] => {
  if (!text) return []
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/[\s-]+/)
    .map((word) => word.replace(/^'+|'+$/g, ''))
    .filter(
      (word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word)
    )
    .map((word) =>
      word.length > 4 && word.endsWith('s') && !word.endsWith('ss')
        ? word.slice(0, -1)
        : word
    )
}

const itemWords = (item: LibraryItemNode) =>
  Array.from(new Set(wordsOf(`${item.title} ${item.description ?? ''}`)))

// What a feed item records as its feed, or the site for everything else.
export const sourceKey = (item: LibraryItemNode): string => {
  if (item.subscription) return item.subscription.toLowerCase()
  if (item.siteName) return item.siteName.toLowerCase()
  try {
    return new URL(item.originalArticleUrl || item.url).hostname.replace(
      /^www\./,
      ''
    )
  } catch {
    return item.url
  }
}

const isSavedByYou = (item: LibraryItemNode) =>
  item.folder !== 'following' && !item.subscription

// How much you engaged with an item, from 0 (ignored or skipped) to 1
// (read most of it, highlighted it, or kept it). Undefined when there is
// nothing to go on yet.
export const engagement = (
  item: LibraryItemNode,
  skipped: Set<string>
): number | undefined => {
  if (skipped.has(item.id)) return 0
  const progress = item.readingProgressPercent ?? 0
  if (progress >= 60 || (item.highlightsCount ?? 0) > 0) return 1
  // Saved from a feed into the library.
  if (item.subscription && item.folder && item.folder !== 'following') return 1
  if (progress >= 10) return 0.6
  if (item.seenAt || item.state === State.ARCHIVED) return 0
  // Saved by hand: a sign of interest even before it is read.
  if (isSavedByYou(item)) return 0.7
  return undefined
}

type Profile = {
  words: Map<string, number>
  documentFrequency: Map<string, number>
  documents: number
  sources: Map<string, { score: number; count: number }>
}

export const learnProfile = (
  history: LibraryItemNode[],
  skipped: Set<string>
): Profile => {
  const words = new Map<string, number>()
  const documentFrequency = new Map<string, number>()
  const sources = new Map<string, { score: number; count: number }>()
  for (const item of history) {
    const unique = itemWords(item)
    unique.forEach((word) =>
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1)
    )
    const value = engagement(item, skipped)
    if (value === undefined) continue
    // Read items pull their words up; ignored ones push them down a little.
    const weight = value - 0.4
    unique.forEach((word) => words.set(word, (words.get(word) ?? 0) + weight))
    if (item.pageType !== 'VIDEO' || item.subscription) {
      const key = sourceKey(item)
      const source = sources.get(key) ?? { score: 0, count: 0 }
      source.score += value
      source.count += 1
      sources.set(key, source)
    }
  }
  return { words, documentFrequency, documents: history.length, sources }
}

const affinityOf = (profile: Profile, item: LibraryItemNode) => {
  const source = profile.sources.get(sourceKey(item))
  // Starts at a neutral 0.5 and moves with each item you read or ignore.
  return {
    value: ((source?.score ?? 0) + 1) / ((source?.count ?? 0) + 2),
    count: source?.count ?? 0,
  }
}

const relevanceOf = (profile: Profile, item: LibraryItemNode) => {
  const unique = itemWords(item)
  let total = 0
  let best: { word: string; value: number } | undefined
  for (const word of unique) {
    const weight = profile.words.get(word) ?? 0
    if (weight <= 0) continue
    const idf =
      Math.log(
        (profile.documents + 1) /
          ((profile.documentFrequency.get(word) ?? 0) + 1)
      ) + 1
    const value = weight * idf
    total += value
    // Only name a topic you have read about more than once.
    if (weight >= 1 && (!best || value > best.value)) best = { word, value }
  }
  return { value: total / Math.sqrt(unique.length + 1), topic: best?.word }
}

// Points and comments some feeds put in the summary (Hacker News, Lobsters).
export const pointsInText = (text: string | undefined) => {
  const points = text?.match(/(?:points?|score)\s*:?\s*(\d+)|(\d+)\s+points?/i)
  const comments = text?.match(/(?:comments?)\s*:?\s*(\d+)|(\d+)\s+comments?/i)
  return {
    points: Number(points?.[1] ?? points?.[2] ?? 0),
    comments: Number(comments?.[1] ?? comments?.[2] ?? 0),
  }
}

const normalisedUrl = (item: LibraryItemNode) => {
  try {
    const url = new URL(item.originalArticleUrl || item.url)
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(
      /\/$/,
      ''
    )}`
  } catch {
    return item.url
  }
}

const overlap = (a: string[], b: string[]) => {
  if (a.length < 3 || b.length < 3) return 0
  const set = new Set(a)
  const shared = b.filter((word) => set.has(word)).length
  return shared / (a.length + b.length - shared)
}

// How many other feeds brought in the same story.
const coverageOf = (items: LibraryItemNode[]) => {
  const titles = items.map((item) => wordsOf(item.title))
  const urls = items.map(normalisedUrl)
  const keys = items.map(sourceKey)
  return items.map((_, i) => {
    const others = new Set<string>()
    items.forEach((_, j) => {
      if (i === j || keys[i] === keys[j]) return
      if (urls[i] === urls[j] || overlap(titles[i], titles[j]) >= 0.5) {
        others.add(keys[j])
      }
    })
    return others.size
  })
}

const minutesOf = (item: LibraryItemNode) =>
  readingMinutes(item.wordsCount) ??
  // No word count yet: guess from the summary, which is usually a teaser.
  4

const hasImage = (item: LibraryItemNode) => !!(item.headerImage || item.image)

const ageHours = (item: LibraryItemNode, now: Date) => {
  const when = Date.parse(item.publishedAt || item.savedAt || item.createdAt)
  if (isNaN(when)) return 48
  return Math.max(0, (now.getTime() - when) / 3600000)
}

export type Scored = {
  item: LibraryItemNode
  score: number
  relevance: number
  affinity: number
  popularity: number
  freshness: number
  why?: string
}

export const scoreItems = (
  items: LibraryItemNode[],
  profile: Profile,
  input: Pick<BuildInput, 'now' | 'buzz' | 'sourceName'>
): Scored[] => {
  const coverage = coverageOf(items)
  const relevance = items.map((item) => relevanceOf(profile, item))
  const topRelevance = Math.max(0, ...relevance.map((r) => r.value))
  return items.map((item, index) => {
    const rel = topRelevance > 0 ? relevance[index].value / topRelevance : 0
    const affinity = affinityOf(profile, item)
    const inText = pointsInText(item.description)
    const buzz = input.buzz?.get(item.id)
    const points = Math.max(inText.points, buzz?.points ?? 0)
    const comments = Math.max(inText.comments, buzz?.comments ?? 0)
    const fromPoints = Math.min(
      1,
      Math.log1p(points + comments * 2) / Math.log1p(1000)
    )
    const fromCoverage = Math.min(1, coverage[index] / 2)
    const popularity = Math.max(fromPoints, fromCoverage)
    const freshness = Math.exp(-ageHours(item, input.now) / 36)
    const quality =
      (hasImage(item) ? 0.6 : 0) +
      (item.description ? 0.2 : 0) +
      ((item.wordsCount ?? 0) >= 600 ? 0.2 : 0)
    const saved = isSavedByYou(item)
    const score =
      0.35 * rel +
      0.25 * affinity.value +
      0.2 * popularity +
      0.1 * freshness +
      0.1 * quality +
      (saved ? 0.08 : 0)

    // The reason shown with the story is its strongest signal.
    const reasons: { text: string; strength: number }[] = []
    if (saved) reasons.push({ text: 'Saved by you', strength: 0.95 })
    if (coverage[index] > 0) {
      reasons.push({
        text: `On ${coverage[index] + 1} of your feeds`,
        strength: 0.5 + fromCoverage / 2,
      })
    }
    if (points >= 50) {
      reasons.push({
        text: `${points} points${
          buzz && buzz.points >= inText.points ? ` on ${buzz.where}` : ''
        }`,
        strength: 0.4 + fromPoints / 2,
      })
    }
    if (relevance[index].topic && rel >= 0.4) {
      reasons.push({
        text: `More on ${relevance[index].topic}`,
        strength: rel * 0.8,
      })
    }
    if (affinity.count >= 3 && affinity.value >= 0.65) {
      reasons.push({
        text: `You read a lot of ${input.sourceName(item)}`,
        strength: affinity.value * 0.7,
      })
    }
    if (freshness >= 0.85) {
      reasons.push({ text: 'Just published', strength: 0.25 })
    }
    reasons.sort((a, b) => b.strength - a.strength)

    return {
      item,
      score,
      relevance: rel,
      affinity: affinity.value,
      popularity,
      freshness,
      why: reasons[0]?.text,
    }
  })
}

// Local date (yyyy-mm-dd) of the edition that covers `now`. Before the
// edition hour, that is still yesterday's.
export const editionDateFor = (now: Date, hour: number): string => {
  const day = new Date(now)
  if (day.getHours() < hour) day.setDate(day.getDate() - 1)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

export const buildEdition = (input: BuildInput): Edition => {
  const { now, skipped, featured } = input
  const profile = learnProfile(input.history, skipped)

  const fresh = (item: LibraryItemNode) =>
    !featured.has(item.id) &&
    !skipped.has(item.id) &&
    item.state !== State.ARCHIVED &&
    item.state !== State.DELETED &&
    (item.readingProgressPercent ?? 0) < 2 &&
    !item.seenAt

  const pool = input.candidates.filter(fresh)
  const scored = scoreItems(pool, profile, input).sort(
    (a, b) => b.score - a.score
  )

  const entries: EditionEntry[] = []
  const chosen = new Set<string>()
  const perSource = new Map<string, number>()
  let minutes = 0
  let queued = 0

  // The same story from another feed is only shown once.
  const stories: { url: string; words: string[] }[] = []
  const sameStory = (item: LibraryItemNode) =>
    stories.some(
      (story) =>
        story.url === normalisedUrl(item) ||
        overlap(story.words, wordsOf(item.title)) >= 0.5
    )

  const take = (entry: Scored, slot: EditionSlot) => {
    entries.push({ id: entry.item.id, slot, why: entry.why })
    chosen.add(entry.item.id)
    stories.push({
      url: normalisedUrl(entry.item),
      words: wordsOf(entry.item.title),
    })
    const key = sourceKey(entry.item)
    perSource.set(key, (perSource.get(key) ?? 0) + 1)
    minutes += minutesOf(entry.item)
    if (isSavedByYou(entry.item)) queued += 1
  }

  const allowed = (entry: Scored, maxPerSource: number, minimumMet: boolean) =>
    !chosen.has(entry.item.id) &&
    !sameStory(entry.item) &&
    (perSource.get(sourceKey(entry.item)) ?? 0) < maxPerSource &&
    (!isSavedByYou(entry.item) || queued < QUEUE_LIMIT) &&
    (!minimumMet || minutes + minutesOf(entry.item) <= READING_BUDGET_MINUTES)

  // Lead: the best long read with a picture.
  const lead =
    scored.find((s) => hasImage(s.item) && minutesOf(s.item) >= 5) ??
    scored.find((s) => hasImage(s.item)) ??
    scored[0]
  if (lead) take(lead, 'lead')

  // Picked for you: closest to what you read, one per source.
  const byRelevance = [...scored].sort(
    (a, b) =>
      b.relevance * 0.6 +
      b.affinity * 0.4 +
      b.score * 0.5 -
      (a.relevance * 0.6 + a.affinity * 0.4 + a.score * 0.5)
  )
  for (const pass of [true, false]) {
    for (const entry of byRelevance) {
      if (entries.filter((e) => e.slot === 'pick').length >= 3) break
      if (pass && (!hasImage(entry.item) || minutesOf(entry.item) < 3)) continue
      if (allowed(entry, 1, entries.length >= 3)) take(entry, 'pick')
    }
  }

  // Popular: only stories with a real popularity signal.
  const byPopularity = scored
    .filter((s) => s.popularity >= 0.3)
    .sort((a, b) => b.popularity - a.popularity || b.score - a.score)
  for (const entry of byPopularity) {
    if (entries.filter((e) => e.slot === 'popular').length >= 3) break
    if (allowed(entry, 2, true)) take(entry, 'popular')
  }

  // Also today: the best of the rest, short ones first among equals.
  const rest = scored
    .filter((s) => !chosen.has(s.item.id))
    .sort(
      (a, b) =>
        b.score -
        (minutesOf(b.item) > 10 ? 0.05 : 0) -
        (a.score - (minutesOf(a.item) > 10 ? 0.05 : 0))
    )
  // Once the hour is used up, only quick reads still fit, a few of them.
  for (const entry of rest) {
    const briefs = entries.filter((e) => e.slot === 'brief').length
    if (briefs >= 5) break
    const quick = minutesOf(entry.item) <= 5 && briefs < 3
    if (allowed(entry, 2, !quick)) take(entry, 'brief')
  }

  // Watch: new videos from the channels you watch most.
  const videos = scoreItems(input.videos.filter(fresh), profile, input)
    .map((s) => ({
      ...s,
      score: 0.5 * s.affinity + 0.3 * s.freshness + 0.2 * s.popularity,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
  videos.forEach((entry) =>
    entries.push({ id: entry.item.id, slot: 'watch', why: entry.why })
  )

  return {
    date: input.date,
    number: input.number,
    builtAt: now.toISOString(),
    entries,
    skipped: [],
    considered: pool.length,
    sources: new Set(pool.map(sourceKey)).size,
  }
}
