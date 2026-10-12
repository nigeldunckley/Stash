import {
  FeedSuggestion,
  isChannel,
  isStarter,
} from '../networking/feedSuggestions'

// What The Edition borrows from Discover: one story a day from a feed you
// don't follow yet, a whole Discovery Edition on Saturdays, and a verdict
// when a week's trial is up.

// A suggestion has to be at least this good to be recommended on its own.
const RECOMMEND_FLOOR = 0.45
// How many days after a trial ends its verdict is still asked for. A trial
// you never answer is kept.
const VERDICT_DAYS = 3

const DAY = 86_400_000

const dayNumber = (date: string) =>
  Math.floor(new Date(`${date}T12:00:00`).getTime() / DAY)

// Saturday, for an edition's local yyyy-mm-dd date.
export const isSaturday = (date: string): boolean =>
  new Date(`${date}T12:00:00`).getDay() == 6

// The Edition is for reading, and for what your own reading led to, so
// channels and starting points stay on Discover.
const withStory = (s: FeedSuggestion) =>
  s.status == 'NEW' &&
  !!s.feedUrl &&
  !!s.latest[0]?.title &&
  !isChannel(s) &&
  !isStarter(s)

// The day's "Recommended for you": one of the few strongest suggestions with
// a story to show, turning daily so the same one doesn't sit there all week.
export const recommendedFor = (
  date: string,
  suggestions: FeedSuggestion[]
): FeedSuggestion | undefined => {
  const strong = suggestions
    .filter((s) => withStory(s) && s.score >= RECOMMEND_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  if (!strong.length) return undefined
  return strong[dayNumber(date) % strong.length]
}

// The Discovery Edition's stories: a lead, the feeds your reading led to,
// and the writers you keep finishing.
export type DiscoveryIssue = {
  lead: FeedSuggestion
  picks: FeedSuggestion[]
  writers: FeedSuggestion[]
}

export const discoveryIssue = (
  suggestions: FeedSuggestion[]
): DiscoveryIssue | undefined => {
  const ranked = suggestions.filter(withStory).sort((a, b) => b.score - a.score)
  const [lead, ...rest] = ranked
  if (!lead) return undefined
  const byWriter = (s: FeedSuggestion) => s.reasons[0]?.kind == 'writer'
  return {
    lead,
    picks: rest.filter((s) => !byWriter(s)).slice(0, 3),
    writers: rest.filter(byWriter).slice(0, 3),
  }
}

// Week numbers count Saturdays from the first Discovery Edition.
const FIRST_ISSUE = '2026-10-17'
export const issueNumber = (date: string): number =>
  Math.max(1, Math.floor((dayNumber(date) - dayNumber(FIRST_ISSUE)) / 7) + 1)

// Trials whose week is up and haven't been answered yet, oldest first.
export const verdictsDue = (
  suggestions: FeedSuggestion[],
  now = new Date()
): FeedSuggestion[] =>
  suggestions
    .filter((s) => {
      if (s.status != 'TRIAL' || !s.trialEndsAt) return false
      const ended = now.getTime() - new Date(s.trialEndsAt).getTime()
      return ended >= -DAY / 2 && ended < VERDICT_DAYS * DAY
    })
    .sort(
      (a, b) =>
        new Date(a.trialEndsAt as string).getTime() -
        new Date(b.trialEndsAt as string).getTime()
    )

// The seven days of a trial, oldest first, as local yyyy-mm-dd dates.
export const trialDays = (trialEndsAt: string): string[] => {
  const end = new Date(trialEndsAt)
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(end.getTime() - (7 - i) * DAY)
    return localDate(day)
  })
}

export const localDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(date.getDate()).padStart(2, '0')}`
