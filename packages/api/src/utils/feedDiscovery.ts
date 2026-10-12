import psl from 'psl'

// The pure parts of feed discovery: how much each article counts, which sites
// are never worth suggesting, and how a suggestion is scored. Nothing here
// touches the network or the database, so it can be tested on its own.

// What you did with an article decides how much its links count.
export const LINK_WEIGHTS = {
  highlighted: 4,
  finished: 3,
  saved: 2,
  opened: 1.5,
  skipped: 0.3,
} as const

export type Engagement = keyof typeof LINK_WEIGHTS

export type ReadItem = {
  id: string
  title: string
  description?: string | null
  author?: string | null
  originalUrl: string
  // The feed URL for items that came from a feed.
  subscription?: string | null
  folder: string
  progress: number
  readAt?: Date | null
  highlights: number
}

export const engagementOf = (item: ReadItem): Engagement => {
  if (item.highlights > 0) return 'highlighted'
  if (item.progress >= 90) return 'finished'
  if (item.folder !== 'following') return 'saved'
  if (item.readAt || item.progress > 0) return 'opened'
  return 'skipped'
}

export const linkWeight = (item: ReadItem): number =>
  LINK_WEIGHTS[engagementOf(item)]

// Lowercase host without "www.", or undefined for anything that isn't a
// public http(s) URL.
export const hostOf = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined
    }
    return normaliseHost(parsed.hostname)
  } catch {
    return undefined
  }
}

export const normaliseHost = (host: string): string | undefined => {
  const clean = host
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '')
  if (!clean.includes('.')) return undefined
  if (/^[\d.]+$/.test(clean) || clean.includes(':')) return undefined
  return clean
}

// Platforms, link shorteners and reference sites: linked often, but not a
// feed anyone means to follow. YouTube is handled as channels instead.
const PLATFORM_HOSTS = [
  'twitter.com',
  'x.com',
  't.co',
  'facebook.com',
  'instagram.com',
  'threads.net',
  'linkedin.com',
  'tiktok.com',
  'bsky.app',
  'mastodon.social',
  'reddit.com',
  'news.ycombinator.com',
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'github.com',
  'gist.github.com',
  'gitlab.com',
  'wikipedia.org',
  'wikimedia.org',
  'archive.org',
  'archive.ph',
  'google.com',
  'goo.gl',
  'apple.com',
  'apps.apple.com',
  'amazon.com',
  'amazon.co.uk',
  'amzn.to',
  'bit.ly',
  'ow.ly',
  'buff.ly',
  'imgur.com',
  'flickr.com',
  'spotify.com',
  'soundcloud.com',
  'medium.com',
  'substack.com',
  'patreon.com',
  'ko-fi.com',
  'buymeacoffee.com',
  'paypal.com',
  'gravatar.com',
  'wordpress.com',
  'feedburner.com',
  'feedly.com',
  'doi.org',
  'arxiv.org',
  'mailchi.mp',
  'list-manage.com',
  'cloudfront.net',
  'amazonaws.com',
  'googleusercontent.com',
  'gstatic.com',
  'w3.org',
]

export const isPlatformHost = (host: string): boolean =>
  PLATFORM_HOSTS.some((p) => host === p || host.endsWith(`.${p}`)) &&
  // A newsletter on Substack is a real publication, the platform isn't.
  !(host.endsWith('.substack.com') && host !== 'substack.com')

// The site a host belongs to for counting, so "blog.example.com" and
// "example.com" count together. The public suffix list knows where a site
// starts (bbc.co.uk, publisher.com.br); hosts that publish many separate
// sites (Substack, GitHub Pages, Blogspot) keep their subdomain.
const SHARED_SUFFIXES = [
  'substack.com',
  'github.io',
  'blogspot.com',
  'wordpress.com',
  'tumblr.com',
  'bearblog.dev',
  'micro.blog',
]

export const siteOf = (host: string): string => {
  const shared = SHARED_SUFFIXES.find((s) => host.endsWith(`.${s}`))
  if (shared) {
    return host
      .split('.')
      .slice(-(shared.split('.').length + 1))
      .join('.')
  }
  return psl.get(host) ?? host
}

// Hosts of absolute links in a piece of HTML, counted.
export const linkHosts = (html: string): Map<string, number> => {
  const hosts = new Map<string, number>()
  const re = /href\s*=\s*["']https?:\/\/([^"'/:?#\s]+)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const host = normaliseHost(match[1])
    if (host) hosts.set(host, (hosts.get(host) ?? 0) + 1)
  }
  return hosts
}

// A small word profile, used to compare a feed's latest posts with what you
// read. Short and very common words are dropped.
const STOP_WORDS = new Set(
  (
    'about after again also among an and any are because been before being ' +
    'between both but can could did does doing down during each few for from ' +
    'further had has have having her here hers him his how into its itself ' +
    'just more most much must not now off once only other our ours out over ' +
    'own same she should some such than that the their theirs them then there ' +
    'these they this those through too under until upon very was were what ' +
    'when where which while who whom why will with would you your yours new ' +
    'how why what one two three first last year years week day days make made ' +
    'get got like way ways thing things people time'
  ).split(' ')
)

export const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .split(/[^a-z0-9À-ɏ]+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))

export type WordProfile = Map<string, number>

export const addToProfile = (
  profile: WordProfile,
  text: string,
  weight = 1
): WordProfile => {
  for (const word of wordsOf(text)) {
    profile.set(word, (profile.get(word) ?? 0) + weight)
  }
  return profile
}

export const cosine = (a: WordProfile, b: WordProfile): number => {
  let dot = 0
  let na = 0
  let nb = 0
  a.forEach((v, k) => {
    na += v * v
    const w = b.get(k)
    if (w) dot += v * w
  })
  b.forEach((v) => (nb += v * v))
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

export const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (!a.size || !b.size) return 0
  let both = 0
  a.forEach((x) => b.has(x) && both++)
  return both / (a.size + b.size - both)
}

// Posts a week, from publish dates, over the span they cover (at least four
// weeks, so a burst of three posts yesterday isn't read as a firehose).
export const postsPerWeek = (dates: Date[], now = new Date()): number => {
  const valid = dates
    .map((d) => d.getTime())
    .filter((t) => !isNaN(t) && t <= now.getTime())
  if (!valid.length) return 0
  const oldest = Math.min(...valid)
  const weeks = Math.max(4, (now.getTime() - oldest) / (7 * 24 * 3600 * 1000))
  return valid.length / weeks
}

export const normaliseName = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^by\s+/, '')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Bylines that are a person's name rather than "Staff" or a publication.
export const looksLikePerson = (name: string): boolean => {
  const n = normaliseName(name)
  const words = n.split(' ')
  return (
    words.length >= 2 &&
    words.length <= 4 &&
    !/\b(staff|team|editor|editors|news|desk|admin|guest|contributor|and)\b/.test(
      n
    )
  )
}

export type Signals = {
  links: number
  taste: number
  neighbour: number
  writer: number
  saves: number
  health: number
}

export const SIGNAL_WEIGHTS: Signals = {
  links: 0.3,
  taste: 0.2,
  neighbour: 0.15,
  writer: 0.15,
  saves: 0.1,
  health: 0.1,
}

// Turns an open-ended count into 0–1, reaching about two thirds at `half`.
export const saturate = (value: number, half: number): number =>
  value <= 0 ? 0 : 1 - Math.exp(-value / half)

export type HealthInput = {
  postsPerWeek: number
  lastPostAt?: Date | null
  hasFullText: boolean
  hasImages: boolean
}

export const MAX_POSTS_PER_WEEK = 30
export const QUIET_DAYS = 60

// Whether a feed can be suggested at all.
export const isHealthy = (input: HealthInput, now = new Date()): boolean => {
  if (!input.lastPostAt) return false
  const days = (now.getTime() - input.lastPostAt.getTime()) / 86_400_000
  return days <= QUIET_DAYS && input.postsPerWeek <= MAX_POSTS_PER_WEEK
}

export const healthScore = (input: HealthInput, now = new Date()): number => {
  if (!isHealthy(input, now) || !input.lastPostAt) return 0
  const days = (now.getTime() - input.lastPostAt.getTime()) / 86_400_000
  const recent = days <= 30 ? 1 : 0.5
  const steady =
    input.postsPerWeek >= 0.25 && input.postsPerWeek <= 20 ? 1 : 0.5
  return (
    0.4 * recent +
    0.3 * steady +
    0.2 * (input.hasFullText ? 1 : 0) +
    0.1 * (input.hasImages ? 1 : 0)
  )
}

export const scoreOf = (signals: Signals): number =>
  (Object.keys(SIGNAL_WEIGHTS) as (keyof Signals)[]).reduce(
    (sum, key) => sum + SIGNAL_WEIGHTS[key] * Math.min(1, signals[key]),
    0
  )

// Only suggestions at or above this are shown.
export const SCORE_FLOOR = 0.25

// Keeps the list varied: no more than `perGuide` suggestions whose strongest
// reason is the same feed.
export const pickVaried = <T extends { score: number; leadGuide?: string }>(
  items: T[],
  perGuide = 2
): T[] => {
  const used = new Map<string, number>()
  return [...items]
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      if (!item.leadGuide) return true
      const n = used.get(item.leadGuide) ?? 0
      if (n >= perGuide) return false
      used.set(item.leadGuide, n + 1)
      return true
    })
}

// How much a guide (one of your feeds) is trusted, after you keep or drop
// what it led you to.
export const GUIDE_MIN = 0.3
export const GUIDE_MAX = 2
export const GUIDE_STEP = 0.15

export const nudgeGuide = (weight: number, liked: boolean): number =>
  Math.min(
    GUIDE_MAX,
    Math.max(GUIDE_MIN, weight + (liked ? GUIDE_STEP : -GUIDE_STEP))
  )
