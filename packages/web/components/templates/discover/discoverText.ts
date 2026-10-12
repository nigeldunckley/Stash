import {
  FeedSuggestion,
  FeedSuggestionReason,
} from '../../../lib/networking/feedSuggestions'
import { faviconFor } from '../../../lib/textFormatting'

// The words around a suggestion: why it's here, how often it posts, and where
// it lives.

const times = (n: number) => (n == 1 ? 'once' : n == 2 ? 'twice' : `${n}×`)

export const reasonLine = (reason: FeedSuggestionReason): string => {
  switch (reason.kind) {
    case 'link':
      return `Linked ${times(reason.count)} by ${reason.guideName}`
    case 'blogroll':
      return `In ${reason.guideName}’s blogroll`
    case 'save':
      return reason.count > 1
        ? `You saved ${reason.count} of its pieces`
        : 'You saved one of its pieces'
    case 'writer':
      return `${reason.guideName} writes here · you finished ${reason.count}`
    case 'neighbour':
      return `Links to the same places as ${reason.guideName}`
    case 'similar':
      return `Similar to ${reason.guideName}`
    case 'starter':
      return reason.title
        ? `A starting point · ${reason.title}`
        : 'A starting point'
  }
}

export const whyLine = (s: FeedSuggestion): string =>
  s.reasons.length ? reasonLine(s.reasons[0]) : 'From what you read'

// One sentence, for the featured suggestion.
export const whySentence = (s: FeedSuggestion): string => {
  if (s.reasons[0]?.kind == 'starter') {
    return 'A well-kept place to start while Stash learns what you read.'
  }
  const links = s.reasons.filter((r) => r.kind == 'link')
  const parts: string[] = []
  const roll = s.reasons.find((r) => r.kind == 'blogroll')
  if (roll) parts.push(`${roll.guideName} lists it in their blogroll`)
  if (links.length == 1) {
    parts.push(
      `${links[0].guideName} linked here ${times(links[0].count)} lately`
    )
  } else if (links.length > 1) {
    parts.push(
      `${links
        .slice(0, 3)
        .map((r) => r.guideName)
        .join(', ')
        .replace(/, ([^,]*)$/, ' and $1')} all link here`
    )
  }
  const writer = s.reasons.find((r) => r.kind == 'writer')
  if (writer) {
    parts.push(
      `it's where ${writer.guideName} writes, and you've finished ${writer.count} of their pieces`
    )
  }
  const save = s.reasons.find((r) => r.kind == 'save')
  if (save) parts.push(`you've saved from it before`)
  const similar = s.reasons.find((r) => r.kind == 'similar')
  if (similar) parts.push(`it's similar to ${similar.guideName}`)
  if (!parts.length) return 'It reads like what you read.'
  const sentence = parts.join(', and ')
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.'
}

export const cadence = (perWeek?: number): string | undefined => {
  if (!perWeek || perWeek <= 0) return undefined
  if (perWeek >= 1) return `≈ ${Math.round(perWeek)} / week`
  const perMonth = perWeek * 4.3
  if (perMonth >= 1) return `≈ ${Math.round(perMonth)} / month`
  return 'Now and then'
}

export const hostOf = (url?: string): string => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

export const iconFor = (s: FeedSuggestion): string | undefined => s.icon

export const fallbackIconFor = (s: FeedSuggestion): string | undefined =>
  faviconFor(s.siteUrl)

// A guide is one of your feeds; its key is the feed's address.
export const isGuide = (reason: FeedSuggestionReason): boolean =>
  reason.kind == 'link' ||
  reason.kind == 'blogroll' ||
  reason.kind == 'neighbour' ||
  reason.kind == 'similar'

export const guideIcon = (reason: FeedSuggestionReason): string | undefined =>
  isGuide(reason) ? faviconFor(reason.guide) : undefined

export const matchPercent = (s: FeedSuggestion): number =>
  Math.round(Math.min(1, s.score / 0.8) * 100)

export const trialDaysLeft = (s: FeedSuggestion, now = new Date()) => {
  if (!s.trialEndsAt) return undefined
  const ms = new Date(s.trialEndsAt).getTime() - now.getTime()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}
