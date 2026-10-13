// When The Edition is out. A new issue arrives once a week (Saturday at
// 07:00 unless changed in Settings) and stays out until the end of that
// Sunday, or until it is marked read, whichever comes first.

import { localDate } from './discovery'

export const DEFAULT_ISSUE_DAY = 6
export const DEFAULT_ISSUE_HOUR = 7

export type IssueSchedule = { day: number; hour: number }

const DAY = 86_400_000

const atHour = (date: string, hour: number) => {
  const at = new Date(`${date}T00:00:00`)
  at.setHours(hour)
  return at
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

// Local yyyy-mm-dd date of the latest issue at or before `now`.
export const issueDateFor = (now: Date, schedule: IssueSchedule): string => {
  const back = (now.getDay() - schedule.day + 7) % 7
  let date = localDate(addDays(now, -back))
  if (atHour(date, schedule.hour) > now) {
    date = localDate(addDays(atHour(date, 12), -7))
  }
  return date
}

// When the issue made on `date` stops being out: midnight at the end of the
// Sunday on or after it.
export const outUntil = (date: string): Date => {
  const day = atHour(date, 0)
  return addDays(day, ((7 - day.getDay()) % 7) + 1)
}

export const issueIsOut = (
  now: Date,
  schedule: IssueSchedule,
  read: string[]
): { out: boolean; date: string } => {
  const date = issueDateFor(now, schedule)
  return {
    date,
    out: now < outUntil(date) && !read.includes(date),
  }
}

// When the next issue arrives.
export const nextIssueAt = (now: Date, schedule: IssueSchedule): Date =>
  atHour(
    localDate(addDays(atHour(issueDateFor(now, schedule), 12), 7)),
    schedule.hour
  )

// The start of the seven days an issue covers.
export const weekStart = (date: string): Date => addDays(atHour(date, 0), -7)

export const dayName = (day: number): string =>
  [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][day] ?? 'Saturday'

export const hourLabel = (hour: number): string =>
  `${String(hour).padStart(2, '0')}:00`
