import {
  FeedSuggestion,
  isChannel,
  isStarter,
} from '../networking/feedSuggestions'

// What The Edition borrows from Discover: writers and sites you don't follow
// yet, and a verdict when a week's trial is up.

// A suggestion has to be at least this good to be shown on its own.
const SOMEONE_NEW_FLOOR = 0.45
// How many days after a trial ends its verdict is still asked for. An issue
// comes out once a week, so a whole week. A trial you never answer is kept.
const VERDICT_DAYS = 7

const DAY = 86_400_000

const dayNumber = (date: string) =>
  Math.floor(new Date(`${date}T12:00:00`).getTime() / DAY)

// The Edition is for reading, and for what your own reading led to, so
// channels and starting points stay on Discover.
const withStory = (s: FeedSuggestion) =>
  s.status == 'NEW' &&
  !!s.feedUrl &&
  !!s.latest[0]?.title &&
  !isChannel(s) &&
  !isStarter(s)

// "Someone new": the strongest suggestions with a story to show, one of
// them a writer you keep finishing when there is one.
export const someoneNew = (
  suggestions: FeedSuggestion[],
  count = 2
): FeedSuggestion[] => {
  const ranked = suggestions
    .filter((s) => withStory(s) && s.score >= SOMEONE_NEW_FLOOR)
    .sort((a, b) => b.score - a.score)
  const writer = ranked.find((s) => s.reasons[0]?.kind == 'writer')
  const picks = ranked.slice(0, count)
  if (writer && !picks.includes(writer) && picks.length == count) {
    picks[count - 1] = writer
  }
  return picks
}

// Issue numbers count weeks from the first weekly Edition.
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
