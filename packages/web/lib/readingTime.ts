// Average adult reading speed used across Stash for time estimates.
const WORDS_PER_MINUTE = 235

export const readingMinutes = (wordsCount?: number): number | undefined => {
  if (!wordsCount || wordsCount <= 0) {
    return undefined
  }
  return Math.max(1, Math.round(wordsCount / WORDS_PER_MINUTE))
}

export const minutesLeft = (
  wordsCount?: number,
  progressPercent?: number
): number | undefined => {
  const total = readingMinutes(wordsCount)
  if (total === undefined) {
    return undefined
  }
  const progress = Math.min(100, Math.max(0, progressPercent ?? 0))
  if (progress >= 100) {
    return 0
  }
  return Math.max(1, Math.round(total * (1 - progress / 100)))
}

export const formatMinutes = (minutes?: number): string | undefined => {
  if (minutes === undefined) {
    return undefined
  }
  if (minutes === 0) {
    return 'Read'
  }
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}
