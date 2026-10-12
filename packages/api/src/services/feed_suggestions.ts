// Feed discovery: once a night Stash looks at what you read, works out which
// sites your feeds keep pointing to, and checks their feeds. A reviewed set
// of related publishers supplies candidates when articles have no useful
// links. Nothing about your reading leaves the server; requests only go to
// candidate publishers' public sites and feeds.

import axios from 'axios'
import dns from 'dns'
import http from 'http'
import https from 'https'
import * as privateIpLib from 'private-ip'
import { parseHTML } from 'linkedom'
import Parser, { Item } from 'rss-parser'
import { In } from 'typeorm'
import {
  FeedSuggestion,
  FeedSuggestionPost,
  FeedSuggestionReason,
  FeedSuggestionStatus,
} from '../entity/feed_suggestion'
import { FeedSuggestionGuide } from '../entity/feed_suggestion_guide'
import {
  Subscription,
  SubscriptionStatus,
  SubscriptionType,
} from '../entity/subscription'
import { authTrx, getRepository } from '../repository'
import {
  addToProfile,
  cosine,
  engagementOf,
  healthScore,
  hostOf,
  isHealthy,
  isPlatformHost,
  jaccard,
  linkHosts,
  linkWeight,
  looksLikePerson,
  normaliseName,
  nudgeGuide,
  pickVaried,
  postsPerWeek,
  ReadItem,
  saturate,
  SCORE_FLOOR,
  scoreOf,
  Signals,
  siteOf,
  WordProfile,
} from '../utils/feedDiscovery'
import { getAbsoluteUrl, wait } from '../utils/helpers'
import { imageFromHtml } from '../utils/feedImages'
import { logger } from '../utils/logger'
import { rssParserConfig } from '../utils/parser'
import { validateUrl } from './create_page_save_request'
import { catalog } from './feed_suggestions/catalog'

// How far back reading counts.
const LOOKBACK_DAYS = 60
// Sites whose feed is looked up in one night, and requests in all.
const MAX_SITES_PER_RUN = 25
const MAX_REQUESTS_PER_RUN = 60
// Pause between requests, so no site sees a burst from us.
const REQUEST_GAP_MS = 750
// A site's feed is looked at again after a week, a site without one after
// a month.
const RECHECK_DAYS = 7
const NOFEED_RECHECK_DAYS = 30
// Candidates considered each night, strongest first.
const MAX_CANDIDATES = 150
// The '@run' guide row records when suggestions were last built.
const RUN_GUIDE = '@run'
const SAVES_GUIDE = 'saves'
const WRITERS_GUIDE = 'writers'
const TRIAL_DAYS = 7

type Guide = { key: string; name: string }

type Edge = {
  weight: number
  count: number
  example?: { title: string; weight: number }
}

type Candidate = {
  site: string
  // the host seen most often, used to find the site's feed
  hosts: Map<string, number>
  edges: Map<string, Edge>
  similar: Map<string, number>
  catalogFeedUrl?: string
  saves: number
  saveTitle?: string
  prelim: number
}

export type ReadingData = {
  items: ReadItem[]
  links: { id: string; host: string }[]
  subscriptions: Subscription[]
}

const ITEM_FILTER = `
  li.user_id = $1
  AND li.deleted_at IS NULL
  AND li.state <> 'DELETED'
  AND li.saved_at > NOW() - INTERVAL '${LOOKBACK_DAYS} days'
`

const readReadingData = async (userId: string): Promise<ReadingData> => {
  const [items, links] = await authTrx(
    async (tx) => {
      const items = (await tx.query(
        `SELECT li.id, li.title, li.description, li.author,
                li.original_url AS "originalUrl", li.subscription, li.folder,
                li.reading_progress_bottom_percent AS progress,
                li.read_at AS "readAt",
                (SELECT count(*) FROM omnivore.highlight h
                  WHERE h.library_item_id = li.id)::int AS highlights
         FROM omnivore.library_item li
         WHERE ${ITEM_FILTER}
         ORDER BY li.saved_at DESC
         LIMIT 3000`,
        [userId]
      )) as ReadItem[]
      // Link hosts are pulled out in the database, so article text never
      // has to be loaded here.
      const links = (await tx.query(
        `SELECT DISTINCT li.id, lower(m[1]) AS host
         FROM omnivore.library_item li
         CROSS JOIN LATERAL regexp_matches(
           li.readable_content, 'href\\s*=\\s*["'']https?://([^"''/:?#\\s]+)', 'gi'
         ) AS m
         WHERE ${ITEM_FILTER}`,
        [userId]
      )) as { id: string; host: string }[]
      return [items, links] as const
    },
    { uid: userId, replicationMode: 'replica' }
  )
  const subscriptions = await getRepository(Subscription).find({
    where: { user: { id: userId }, type: SubscriptionType.Rss },
  })
  return { items, links, subscriptions }
}

export type ReadingGraph = {
  candidates: Candidate[]
  followedSites: Set<string>
  leftSites: Set<string>
  guides: Map<string, Guide>
  profile: WordProfile
  // writers you finish, by normalised name
  writers: Map<string, { name: string; count: number }>
  // the sites each of your favourite feeds links to
  favourites: { guide: Guide; sites: Set<string> }[]
  articles: number
}

// Builds the graph from your reading: which sites each of your feeds (and
// your own saves) link to, weighted by what you did with each article.
export const buildReadingGraph = (
  data: ReadingData,
  guideWeights: Map<string, number>
): ReadingGraph => {
  const bySubscriptionUrl = new Map(
    data.subscriptions.map((s) => [s.url ?? '', s])
  )
  const followedSites = new Set<string>()
  const leftSites = new Set<string>()
  for (const sub of data.subscriptions) {
    const host = hostOf(sub.url)
    if (!host) continue
    const target =
      sub.status === SubscriptionStatus.Active ? followedSites : leftSites
    target.add(siteOf(host))
  }
  // A feed's articles can live on a different host from the feed itself.
  for (const item of data.items) {
    const sub = item.subscription && bySubscriptionUrl.get(item.subscription)
    const host = hostOf(item.originalUrl)
    if (!sub || !host) continue
    const target =
      sub.status === SubscriptionStatus.Active ? followedSites : leftSites
    target.add(siteOf(host))
  }
  leftSites.forEach((s) => followedSites.has(s) && leftSites.delete(s))

  const guides = new Map<string, Guide>()
  const guideOf = (item: ReadItem): Guide | undefined => {
    if (item.subscription) {
      const sub = bySubscriptionUrl.get(item.subscription)
      return { key: item.subscription, name: sub?.name ?? item.subscription }
    }
    if (item.folder !== 'following') {
      return { key: SAVES_GUIDE, name: 'Your saves' }
    }
    return undefined
  }

  const linksByItem = new Map<string, string[]>()
  for (const { id, host } of data.links) {
    const list = linksByItem.get(id) ?? []
    list.push(host)
    linksByItem.set(id, list)
  }

  const candidates = new Map<string, Candidate>()
  const candidateFor = (site: string) => {
    let c = candidates.get(site)
    if (!c) {
      c = {
        site,
        hosts: new Map(),
        edges: new Map(),
        similar: new Map(),
        saves: 0,
        prelim: 0,
      }
      candidates.set(site, c)
    }
    return c
  }
  const suggestible = (host: string) => {
    const site = siteOf(host)
    return !isPlatformHost(host) &&
      !followedSites.has(site) &&
      !leftSites.has(site)
      ? site
      : undefined
  }

  const profile: WordProfile = new Map()
  const writers = new Map<string, { name: string; count: number }>()
  const guideSites = new Map<string, Set<string>>()
  const guideStrength = new Map<string, number>()

  for (const item of data.items) {
    const weight = linkWeight(item)
    const engagement = engagementOf(item)
    const itemHost = hostOf(item.originalUrl)
    const itemSite = itemHost && siteOf(itemHost)
    const guide = guideOf(item)

    if (engagement !== 'skipped' && engagement !== 'opened') {
      addToProfile(profile, `${item.title} ${item.description ?? ''}`, weight)
    }

    if (
      (engagement === 'finished' || engagement === 'highlighted') &&
      item.author &&
      looksLikePerson(item.author)
    ) {
      const key = normaliseName(item.author)
      const w = writers.get(key) ?? { name: item.author.trim(), count: 0 }
      w.count++
      writers.set(key, w)
    }

    // Sites you save from without following them.
    if (item.folder !== 'following' && itemHost) {
      const site = suggestible(itemHost)
      if (site) {
        const c = candidateFor(site)
        c.saves++
        c.saveTitle = c.saveTitle ?? item.title
        c.hosts.set(itemHost, (c.hosts.get(itemHost) ?? 0) + 1)
      }
    }

    if (!guide) continue
    guides.set(guide.key, guide)
    guideStrength.set(guide.key, (guideStrength.get(guide.key) ?? 0) + weight)
    const linked = guideSites.get(guide.key) ?? new Set<string>()
    guideSites.set(guide.key, linked)

    for (const rawHost of new Set(linksByItem.get(item.id) ?? [])) {
      const host = hostOf(`https://${rawHost}/`)
      if (!host) continue
      const site = siteOf(host)
      if (site === itemSite) continue
      if (!isPlatformHost(host)) linked.add(site)
      if (!suggestible(host)) continue
      const c = candidateFor(site)
      c.hosts.set(host, (c.hosts.get(host) ?? 0) + 1)
      const edge = c.edges.get(guide.key) ?? { weight: 0, count: 0 }
      edge.weight += weight
      edge.count++
      if (!edge.example || weight > edge.example.weight) {
        edge.example = { title: item.title, weight }
      }
      c.edges.set(guide.key, edge)
    }
  }

  // Article extraction and short RSS summaries often contain no outbound
  // links. Use the reviewed publisher relationships as another route from a
  // followed feed to a candidate, even on a reader's first Discover run.
  const articleSiteBySubscription = new Map<string, string>()
  for (const item of data.items) {
    if (
      !item.subscription ||
      articleSiteBySubscription.has(item.subscription)
    ) {
      continue
    }
    const host = hostOf(item.originalUrl)
    if (host) articleSiteBySubscription.set(item.subscription, siteOf(host))
  }
  for (const feed of catalog) {
    const host = hostOf(`https://${feed.site}/`)
    if (!host || !suggestible(host)) continue
    const related = data.subscriptions.filter((sub) => {
      if (sub.status !== SubscriptionStatus.Active || !sub.url) return false
      const sourceHost = hostOf(sub.url)
      const sourceSite =
        articleSiteBySubscription.get(sub.url) ||
        (sourceHost && siteOf(sourceHost))
      return (
        !!sourceSite &&
        !!feed.related?.some(
          (relatedSite) => sourceSite === siteOf(relatedSite)
        )
      )
    })
    if (!related.length) continue
    const candidate = candidateFor(siteOf(host))
    candidate.catalogFeedUrl = feed.url
    candidate.hosts.set(host, (candidate.hosts.get(host) ?? 0) + 1)
    for (const sub of related) {
      if (!sub.url) continue
      candidate.similar.set(sub.url, 1)
      guides.set(sub.url, { key: sub.url, name: sub.name })
    }
  }

  const trust = (key: string) => guideWeights.get(key) ?? 1
  for (const c of candidates.values()) {
    let linkSum = 0
    c.edges.forEach((e, key) => (linkSum += e.weight * trust(key)))
    c.prelim =
      linkSum +
      c.saves * 2 * trust(SAVES_GUIDE) +
      [...c.similar.keys()].reduce((sum, key) => sum + 3 * trust(key), 0)
  }

  const favourites = [...guideStrength.entries()]
    .filter(([key]) => key !== SAVES_GUIDE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => ({
      guide: guides.get(key) as Guide,
      sites: guideSites.get(key) ?? new Set<string>(),
    }))
    .filter((f) => f.guide && f.sites.size >= 3)

  return {
    candidates: [...candidates.values()]
      // one link from one skipped article isn't a signal
      .filter((c) => c.prelim >= 1)
      .sort((a, b) => b.prelim - a.prelim)
      .slice(0, MAX_CANDIDATES),
    followedSites,
    leftSites,
    guides,
    profile,
    writers: new Map([...writers].filter(([, w]) => w.count >= 2)),
    favourites,
    articles: data.items.length,
  }
}

// ---------------------------------------------------------------------------
// Looking up a site's feed

export type SiteFeed = {
  feedUrl: string
  siteUrl: string
  title?: string
  description?: string
  icon?: string
  author?: string
  postsPerWeek: number
  lastPostAt?: Date
  latest: FeedSuggestionPost[]
  outHosts: string[]
  hasFullText: boolean
  hasImages: boolean
  words: string
}

type Fetcher = {
  get: (url: string) => Promise<{ data: string; contentType: string } | null>
  used: () => number
}

// Candidate sites come from links in articles, so anyone can name one.
// Every connection is checked after DNS resolves, so a public name that
// resolves to a private address is refused, and redirects are followed by
// hand so each hop is checked too.
const isPrivateIP = privateIpLib.default

const publicLookup = (
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number
  ) => void
) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '')
    const list = addresses as dns.LookupAddress[]
    if (!list.length || list.some((a) => isPrivateIP(a.address))) {
      return callback(new Error(`Refused private address for ${hostname}`), '')
    }
    if (options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

const httpAgent = new http.Agent({ lookup: publicLookup } as http.AgentOptions)
const httpsAgent = new https.Agent({
  lookup: publicLookup,
} as https.AgentOptions)

const MAX_REDIRECTS = 3

export const politeFetcher = (limit = MAX_REQUESTS_PER_RUN): Fetcher => {
  let used = 0
  return {
    used: () => used,
    get: async (url: string) => {
      if (used >= limit) return null
      let next = url
      try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          validateUrl(next)
          if (used >= limit) return null
          if (used > 0) await wait(REQUEST_GAP_MS)
          used++
          const res = await axios.get<string>(next, {
            ...rssParserConfig(),
            timeout: 10_000,
            maxContentLength: 3 * 1024 * 1024,
            responseType: 'text',
            maxRedirects: 0,
            httpAgent,
            httpsAgent,
            proxy: false,
            validateStatus: (s) => s >= 200 && s < 400,
          })
          if (res.status >= 300) {
            const location = res.headers['location']
            if (!location) return null
            next = new URL(String(location), next).toString()
            continue
          }
          const header = res.headers['content-type']
          return {
            data: String(res.data ?? ''),
            contentType: String(
              Array.isArray(header) ? header[0] : header ?? ''
            ),
          }
        }
        return null
      } catch {
        return null
      }
    },
  }
}

const FEED_PATHS = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml']

const looksLikeFeed = (text: string) =>
  /<(rss|feed|rdf:RDF)[\s>]/i.test(text.slice(0, 2000))

// Feed links a page advertises, best first.
export const feedLinksIn = (html: string, pageUrl: string): string[] => {
  const dom = parseHTML(html).document
  return Array.from(
    dom.querySelectorAll(
      'link[rel~="alternate"][type="application/rss+xml"], link[rel~="alternate"][type="application/atom+xml"]'
    )
  )
    .map((l) => ({
      href: getAbsoluteUrl(l.getAttribute('href') || '', pageUrl),
      title: (l.getAttribute('title') || '').toLowerCase(),
    }))
    .filter((l) => l.href && !/comment/.test(l.title + l.href))
    .map((l) => l.href)
}

const textOf = (html?: string) =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

type ParsedItem = Item & {
  'content:encoded'?: string
  'media:content'?: { $?: { url?: string } }
  'media:thumbnail'?: { $?: { url?: string } }
  author?: string
}

export const readFeed = async (
  xml: string,
  feedUrl: string,
  siteUrl: string,
  now = new Date()
): Promise<SiteFeed | null> => {
  const parser: Parser<
    { image?: { url?: string }; itunes?: { author?: string } },
    ParsedItem
  > = new Parser({
    customFields: {
      item: ['content:encoded', 'media:content', 'media:thumbnail', 'author'],
    },
  })
  let feed
  try {
    feed = await parser.parseString(xml)
  } catch {
    return null
  }
  const ownSite = hostOf(siteUrl) && siteOf(hostOf(siteUrl) as string)
  const items = feed.items ?? []
  const dated = items
    .map((item) => ({
      item,
      date: item.isoDate ? new Date(item.isoDate) : undefined,
    }))
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))

  const outHosts = new Set<string>()
  let fullText = 0
  let images = 0
  const creators = new Map<string, number>()
  const words: string[] = []

  for (const { item } of dated) {
    const html = item['content:encoded'] || item.content || ''
    linkHosts(html).forEach((_, host) => {
      const site = siteOf(host)
      if (site !== ownSite && !isPlatformHost(host)) outHosts.add(site)
    })
    if (textOf(html).split(' ').length > 150) fullText++
    const creator = item.creator || item.author
    if (creator) creators.set(creator, (creators.get(creator) ?? 0) + 1)
    words.push(item.title ?? '', item.contentSnippet?.slice(0, 300) ?? '')
  }

  const latest: FeedSuggestionPost[] = dated
    .slice(0, 5)
    .map(({ item, date }) => {
      const html = item['content:encoded'] || item.content || ''
      const wordCount = textOf(html).split(' ').length
      const image =
        item.enclosure?.type?.startsWith('image') && item.enclosure.url
          ? item.enclosure.url
          : item['media:content']?.$?.url ||
            imageFromHtml(html, item.link || siteUrl) ||
            item['media:thumbnail']?.$?.url
      if (image) images++
      return {
        title: textOf(item.title) || 'Untitled',
        url: item.link ?? siteUrl,
        image,
        summary: textOf(item.contentSnippet || html).slice(0, 240) || undefined,
        publishedAt: date?.toISOString(),
        minutes:
          wordCount > 150
            ? Math.max(1, Math.round(wordCount / 230))
            : undefined,
      }
    })

  const dates = dated.map((d) => d.date).filter((d): d is Date => !!d)
  const topCreator = [...creators.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    feedUrl,
    siteUrl: feed.link || siteUrl,
    title: textOf(feed.title) || undefined,
    description: textOf(feed.description).slice(0, 300) || undefined,
    icon: feed.image?.url,
    author: feed.itunes?.author || topCreator?.[0],
    postsPerWeek: postsPerWeek(dates, now),
    lastPostAt: dates[0],
    latest,
    outHosts: [...outHosts].slice(0, 200),
    hasFullText: items.length > 0 && fullText / items.length >= 0.5,
    hasImages: images > 0,
    words: words.join(' '),
  }
}

// Finds and reads the feed for a site: the feed its home page advertises,
// or one at a usual address.
export const findSiteFeed = async (
  host: string,
  fetcher: Fetcher,
  now = new Date(),
  knownFeedUrl?: string
): Promise<SiteFeed | null> => {
  const home = `https://${host}/`
  if (knownFeedUrl) {
    const known = await fetcher.get(knownFeedUrl)
    if (known && looksLikeFeed(known.data)) {
      const feed = await readFeed(known.data, knownFeedUrl, home, now)
      if (feed) return feed
    }
  }
  const page = await fetcher.get(home)
  if (!page) return null
  if (looksLikeFeed(page.data)) return readFeed(page.data, home, home, now)

  const advertised = feedLinksIn(page.data, home).slice(0, 2)
  for (const url of advertised) {
    const res = await fetcher.get(url)
    if (res && looksLikeFeed(res.data)) {
      return readFeed(res.data, url, home, now)
    }
  }
  if (advertised.length) return null
  for (const path of FEED_PATHS.slice(0, 3)) {
    const url = `https://${host}${path}`
    const res = await fetcher.get(url)
    if (res && looksLikeFeed(res.data)) {
      return readFeed(res.data, url, home, now)
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Scoring

const reasonsFor = (
  c: Candidate,
  graph: ReadingGraph,
  trust: (key: string) => number
): FeedSuggestionReason[] => {
  const reasons: FeedSuggestionReason[] = [...c.edges.entries()]
    .filter(([key]) => key !== SAVES_GUIDE)
    .sort((a, b) => b[1].weight * trust(b[0]) - a[1].weight * trust(a[0]))
    .slice(0, 4)
    .map(([key, edge]) => ({
      kind: 'link',
      guide: key,
      guideName: graph.guides.get(key)?.name ?? key,
      count: edge.count,
      title: edge.example?.title,
    }))
  for (const key of c.similar.keys()) {
    if (reasons.some((reason) => reason.guide === key)) continue
    reasons.push({
      kind: 'similar',
      guide: key,
      guideName: graph.guides.get(key)?.name ?? key,
      count: 1,
    })
  }
  const fromSaves = c.edges.get(SAVES_GUIDE)
  if (c.saves > 0 || fromSaves) {
    reasons.push({
      kind: 'save',
      guide: SAVES_GUIDE,
      guideName: 'Your saves',
      count: c.saves || fromSaves?.count || 0,
      title: c.saveTitle ?? fromSaves?.example?.title,
    })
  }
  return reasons
}

export const scoreCandidate = (
  c: Candidate,
  feed: SiteFeed,
  graph: ReadingGraph,
  trust: (key: string) => number,
  now = new Date()
): { signals: Signals; score: number; reasons: FeedSuggestionReason[] } => {
  const reasons = reasonsFor(c, graph, trust)

  let linkSum = 0
  c.edges.forEach(
    (e, key) => key !== SAVES_GUIDE && (linkSum += e.weight * trust(key))
  )
  const fromSaves = c.edges.get(SAVES_GUIDE)?.weight ?? 0

  const feedProfile = addToProfile(new Map(), feed.words)
  const taste = Math.min(1, cosine(graph.profile, feedProfile) * 2.5)

  const outHosts = new Set(feed.outHosts)
  let neighbour = 0
  let neighbourOf: { name: string; key: string } | undefined
  for (const fav of graph.favourites) {
    const j = jaccard(outHosts, fav.sites)
    if (j > neighbour) {
      neighbour = j
      neighbourOf = { name: fav.guide.name, key: fav.guide.key }
    }
  }
  neighbour = Math.min(1, neighbour * 4)
  if (neighbourOf && neighbour >= 0.3) {
    reasons.push({
      kind: 'neighbour',
      guide: neighbourOf.key,
      guideName: neighbourOf.name,
      count: Math.round(neighbour * 100),
    })
  }

  let writer = 0
  const byline = normaliseName(`${feed.author ?? ''} ${feed.title ?? ''}`)
  for (const [key, w] of graph.writers) {
    if (byline.includes(key)) {
      writer = saturate(w.count, 2) * trust(WRITERS_GUIDE)
      reasons.unshift({
        kind: 'writer',
        guide: WRITERS_GUIDE,
        guideName: w.name,
        count: w.count,
      })
      break
    }
  }

  const signals: Signals = {
    links: saturate(linkSum, 6),
    taste,
    neighbour,
    writer: Math.min(1, writer),
    saves: saturate((c.saves * 2 + fromSaves) * trust(SAVES_GUIDE), 6),
    health: healthScore(feed, now),
  }
  const healthy = isHealthy(feed, now)
  const similarity = [...c.similar.keys()].reduce(
    (sum, key) => sum + trust(key),
    0
  )
  return {
    signals,
    score: healthy
      ? Math.min(1, scoreOf(signals) + 0.3 * saturate(similarity * 3, 3))
      : 0,
    reasons,
  }
}

// ---------------------------------------------------------------------------
// The nightly run

export type BuildSummary = {
  articles: number
  candidates: number
  checked: number
  requests: number
  shown: number
}

const readGuideWeights = async (userId: string) => {
  const rows = await getRepository(FeedSuggestionGuide).findBy({ userId })
  return new Map(rows.map((r) => [r.guide, r.weight]))
}

export const buildFeedSuggestions = async (
  userId: string,
  options: { fetcher?: Fetcher; now?: Date } = {}
): Promise<BuildSummary> => {
  const now = options.now ?? new Date()
  const fetcher = options.fetcher ?? politeFetcher()
  const repo = getRepository(FeedSuggestion)

  const [data, guideWeights] = await Promise.all([
    readReadingData(userId),
    readGuideWeights(userId),
  ])
  const graph = buildReadingGraph(data, guideWeights)
  const trust = (key: string) => guideWeights.get(key) ?? 1

  const existing = new Map(
    (await repo.findBy({ userId })).map((s) => [s.site, s])
  )

  // Suggestions you've since followed some other way.
  for (const s of existing.values()) {
    if (s.status === 'new' && graph.followedSites.has(s.site)) {
      await repo.update(s.id, { status: 'following' })
      s.status = 'following'
    }
  }

  // Suggestions your reading no longer leads to fade out. Ones it still
  // leads to keep their last score when tonight's checks run out.
  const inGraph = new Set(graph.candidates.map((c) => c.site))
  const followedNow = new Set<string>()
  let checked = 0
  for (const c of graph.candidates) {
    const row = existing.get(c.site)
    if (row && row.status !== 'new' && row.status !== 'nofeed') continue

    const age = row?.checkedAt
      ? (now.getTime() - row.checkedAt.getTime()) / 86_400_000
      : Infinity
    const hasNewCatalogRoute =
      row?.status === 'nofeed' &&
      !!c.catalogFeedUrl &&
      row.feedUrl !== c.catalogFeedUrl
    const stale =
      row?.status === 'nofeed' && !c.catalogFeedUrl
        ? NOFEED_RECHECK_DAYS
        : RECHECK_DAYS
    let feed: SiteFeed | null | undefined
    if (row && age < stale && !hasNewCatalogRoute) {
      if (row.status === 'nofeed' || !row.feedUrl) continue
      feed = {
        feedUrl: row.feedUrl,
        siteUrl: row.siteUrl,
        title: row.title ?? undefined,
        author: row.author ?? undefined,
        postsPerWeek: row.postsPerWeek ?? 0,
        lastPostAt: row.lastPostAt ?? undefined,
        latest: row.latest,
        outHosts: row.outHosts,
        hasFullText: (row.signals.fullText ?? 0) > 0,
        hasImages: row.latest.some((p) => !!p.image),
        words: row.latest.map((p) => `${p.title} ${p.summary ?? ''}`).join(' '),
      }
    } else {
      if (checked >= MAX_SITES_PER_RUN) continue
      if (fetcher.used() >= MAX_REQUESTS_PER_RUN) break
      checked++
      const host = [...c.hosts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      feed = host
        ? await findSiteFeed(host, fetcher, now, c.catalogFeedUrl)
        : null
      if (!feed) {
        await repo.upsert(
          {
            id: row?.id,
            userId,
            site: c.site,
            siteUrl: `https://${host ?? c.site}/`,
            feedUrl: c.catalogFeedUrl ?? row?.feedUrl,
            status: 'nofeed',
            score: 0,
            checkedAt: now,
          },
          ['userId', 'site']
        )
        continue
      }
    }

    // A feed that turns out to be one you follow.
    const feedSite = hostOf(feed.siteUrl)
    if (feedSite && graph.followedSites.has(siteOf(feedSite))) {
      followedNow.add(c.site)
      continue
    }

    const { signals, score, reasons } = scoreCandidate(
      c,
      feed,
      graph,
      trust,
      now
    )
    await repo.upsert(
      {
        id: row?.id,
        userId,
        site: c.site,
        siteUrl: feed.siteUrl,
        feedUrl: feed.feedUrl,
        kind: 'rss',
        title: feed.title ?? c.site,
        description: feed.description ?? row?.description,
        icon: feed.icon ?? row?.icon,
        author: feed.author,
        postsPerWeek: feed.postsPerWeek,
        lastPostAt: feed.lastPostAt,
        latest: feed.latest,
        outHosts: feed.outHosts,
        signals: { ...signals, fullText: feed.hasFullText ? 1 : 0 },
        reasons,
        score,
        status: 'new',
        checkedAt: row && age < stale ? row.checkedAt : now,
      },
      ['userId', 'site']
    )
  }

  const faded = [...existing.values()]
    .filter(
      (s) =>
        s.status === 'new' &&
        s.score > 0 &&
        (!inGraph.has(s.site) || followedNow.has(s.site))
    )
    .map((s) => s.id)
  if (faded.length) await repo.update({ id: In(faded) }, { score: 0 })

  const shown = await repo
    .createQueryBuilder('s')
    .where('s.userId = :userId AND s.status = :status AND s.score >= :floor', {
      userId,
      status: 'new',
      floor: SCORE_FLOOR,
    })
    .getCount()

  await getRepository(FeedSuggestionGuide).upsert(
    { userId, guide: RUN_GUIDE, weight: graph.articles },
    ['userId', 'guide']
  )

  const summary = {
    articles: graph.articles,
    candidates: graph.candidates.length,
    checked,
    requests: fetcher.used(),
    shown,
  }
  logger.info('feed-suggestions: built', { userId, ...summary })
  return summary
}

// ---------------------------------------------------------------------------
// Reading and acting on suggestions

export const listFeedSuggestions = async (
  userId: string,
  statuses: FeedSuggestionStatus[] = ['new'],
  limit = 24
) => {
  const rows = await getRepository(FeedSuggestion).find({
    where: { userId, status: In(statuses) },
    order: { score: 'DESC' },
    take: 200,
  })
  const visible = rows.filter(
    (r) => r.status !== 'new' || r.score >= SCORE_FLOOR
  )
  const varied = pickVaried(
    visible.map((r) => ({
      row: r,
      score: r.status === 'new' ? r.score : Infinity,
      // Only new suggestions are kept varied; your trials and history
      // are listed in full.
      leadGuide: r.status === 'new' ? r.reasons[0]?.guide : undefined,
    }))
  )
  const run = await getRepository(FeedSuggestionGuide).findOneBy({
    userId,
    guide: RUN_GUIDE,
  })
  return {
    suggestions: varied.slice(0, limit).map((v) => v.row),
    builtAt: run?.updatedAt,
    articles: run ? Math.round(run.weight) : 0,
  }
}

export type FeedSuggestionAction =
  | 'FOLLOW'
  | 'TRY'
  | 'KEEP'
  | 'DROP'
  | 'DISMISS'
  | 'RESTORE'

const nudgeGuides = async (
  userId: string,
  reasons: FeedSuggestionReason[],
  liked: boolean
) => {
  const repo = getRepository(FeedSuggestionGuide)
  const keys = [...new Set(reasons.map((r) => r.guide))]
  if (!keys.length) return
  const current = new Map(
    (await repo.findBy({ userId, guide: In(keys) })).map((g) => [
      g.guide,
      g.weight,
    ])
  )
  await repo.upsert(
    keys.map((guide) => ({
      userId,
      guide,
      weight: nudgeGuide(current.get(guide) ?? 1, liked),
    })),
    ['userId', 'guide']
  )
}

// Records what you did with a suggestion. Following and unfollowing the feed
// itself go through the usual subscribe and unsubscribe calls.
export const actOnFeedSuggestion = async (
  userId: string,
  id: string,
  action: FeedSuggestionAction,
  subscriptionId?: string | null,
  now = new Date()
): Promise<FeedSuggestion | null> => {
  const repo = getRepository(FeedSuggestion)
  const row = await repo.findOneBy({ id, userId })
  if (!row) return null

  const was = row.status
  const update: Partial<FeedSuggestion> = {}
  switch (action) {
    case 'FOLLOW':
      update.status = 'following'
      update.subscriptionId = subscriptionId ?? row.subscriptionId
      update.trialEndsAt = null
      if (was !== 'trial') await nudgeGuides(userId, row.reasons, true)
      break
    case 'TRY':
      update.status = 'trial'
      update.subscriptionId = subscriptionId ?? row.subscriptionId
      update.trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000)
      break
    case 'KEEP':
      update.status = 'kept'
      update.trialEndsAt = null
      await nudgeGuides(userId, row.reasons, true)
      break
    case 'DROP':
    case 'DISMISS':
      update.status = 'dismissed'
      update.trialEndsAt = null
      if (was !== 'dismissed') await nudgeGuides(userId, row.reasons, false)
      break
    case 'RESTORE':
      update.status = 'new'
      update.subscriptionId = null
      update.trialEndsAt = null
      // Undo the lesson the last action taught.
      if (was === 'following' || was === 'kept') {
        await nudgeGuides(userId, row.reasons, false)
      } else if (was === 'dismissed') {
        await nudgeGuides(userId, row.reasons, true)
      }
      break
  }
  await repo.update(row.id, update)
  return { ...row, ...update } as FeedSuggestion
}
