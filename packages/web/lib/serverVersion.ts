import { shortTimeAgo } from './textFormatting'

// What's running on the Stash server, for Settings > Developer. The API
// route pages/api/stash/version.ts gathers it; image builds bake in the
// commit details and deploy/status.sh notes each update.

export const STASH_REPO_URL = 'https://github.com/nigeldunckley/Stash'

export type BuildInfo = {
  commit?: string
  subject?: string
  body?: string
  committedAt?: string
  builtAt?: string
  startedAt?: string
}

export type UpdateNote = {
  at: string
  // last-check: up-to-date | updated | failed; last-update: full | images
  result: string
  commit?: string
  subject?: string
  body?: string
  committedAt?: string
}

export type ServerVersion = {
  web: BuildInfo
  // null when the API image predates version reporting
  api: BuildInfo | null
  lastCheck: UpdateNote | null
  lastUpdate: UpdateNote | null
}

// The pull request a commit came from, read from GitHub's merge commit
// ("Merge pull request #12 from …", title on the next line) or squash
// commit ("Title (#12)") messages.
export const describeCommit = (
  info: { subject?: string; body?: string } | null | undefined
): { pr?: number; title?: string } => {
  const subject = info?.subject?.trim()
  if (!subject) {
    return {}
  }
  const merge = subject.match(/^Merge pull request #(\d+)/)
  if (merge) {
    return { pr: Number(merge[1]), title: info?.body?.trim() || undefined }
  }
  const squash = subject.match(/^(.*) \(#(\d+)\)$/)
  if (squash) {
    return { pr: Number(squash[2]), title: squash[1] }
  }
  return { title: subject }
}

// When new code last went live: the updater's note, or else when the
// newest service started (before the updater kept notes).
export const lastServerUpdate = (
  version: ServerVersion | undefined
): string | undefined => {
  if (!version) {
    return undefined
  }
  if (version.lastUpdate?.at) {
    return version.lastUpdate.at
  }
  const starts = [version.web.startedAt, version.api?.startedAt]
    .filter((date): date is string => !!date)
    .sort()
  return starts[starts.length - 1]
}

// "just now", "5 mins ago", "3 Oct", to follow "Updated".
export const updatedAgo = (date: string, now = Date.now()): string => {
  const ago = shortTimeAgo(date, now)
  return ago == 'Just now' ? 'just now' : ago
}
