import { expect } from 'chai'
import 'mocha'
import {
  buildReadingGraph,
  feedLinksIn,
  findSiteFeed,
  readFeed,
  scoreCandidate,
} from '../../src/services/feed_suggestions'
import {
  engagementOf,
  isHealthy,
  isPlatformHost,
  linkHosts,
  looksLikePerson,
  nudgeGuide,
  pickVaried,
  postsPerWeek,
  ReadItem,
  SCORE_FLOOR,
  siteOf,
} from '../../src/utils/feedDiscovery'
import { Subscription, SubscriptionStatus } from '../../src/entity/subscription'

const item = (overrides: Partial<ReadItem>): ReadItem => ({
  id: Math.random().toString(36).slice(2),
  title: 'A post',
  originalUrl: 'https://daringfireball.net/2026/10/post',
  subscription: 'https://daringfireball.net/feeds/main',
  folder: 'following',
  progress: 0,
  highlights: 0,
  ...overrides,
})

const sub = (url: string, name: string, status = SubscriptionStatus.Active) =>
  ({ url, name, status } as Subscription)

describe('feed discovery', () => {
  describe('engagementOf', () => {
    it('ranks highlights over finishing over saving', () => {
      expect(engagementOf(item({ highlights: 2, progress: 100 }))).to.eql(
        'highlighted'
      )
      expect(engagementOf(item({ progress: 95 }))).to.eql('finished')
      expect(engagementOf(item({ folder: 'inbox' }))).to.eql('saved')
      expect(engagementOf(item({ progress: 20 }))).to.eql('opened')
      expect(engagementOf(item({}))).to.eql('skipped')
    })
  })

  describe('sites and hosts', () => {
    it('folds subdomains into their site, except shared hosts', () => {
      expect(siteOf('blog.example.com')).to.eql('example.com')
      expect(siteOf('feeds.bbc.co.uk')).to.eql('bbc.co.uk')
      expect(siteOf('www.publisher.com.br')).to.eql('publisher.com.br')
      expect(siteOf('other.com.br')).to.eql('other.com.br')
      expect(siteOf('stratechery.substack.com')).to.eql(
        'stratechery.substack.com'
      )
    })

    it('never suggests platforms, but does suggest Substack newsletters', () => {
      expect(isPlatformHost('twitter.com')).to.be.true
      expect(isPlatformHost('en.wikipedia.org')).to.be.true
      expect(isPlatformHost('substack.com')).to.be.true
      expect(isPlatformHost('someone.substack.com')).to.be.false
      expect(isPlatformHost('sixcolors.com')).to.be.false
    })

    it('counts link hosts in html', () => {
      const hosts = linkHosts(
        '<a href="https://www.sixcolors.com/a">x</a> <a href=\'http://sixcolors.com/b\'>y</a> <a href="/local">z</a>'
      )
      expect(hosts.get('sixcolors.com')).to.eql(2)
      expect(hosts.size).to.eql(1)
    })
  })

  describe('postsPerWeek', () => {
    it('spreads a burst over at least four weeks', () => {
      const now = new Date('2026-10-12T00:00:00Z')
      const day = 86_400_000
      const dates = [1, 2, 3].map((d) => new Date(now.getTime() - d * day))
      expect(postsPerWeek(dates, now)).to.be.closeTo(0.75, 0.01)
    })
  })

  describe('isHealthy', () => {
    const now = new Date('2026-10-12T00:00:00Z')
    it('drops quiet feeds and firehoses', () => {
      const base = { hasFullText: true, hasImages: true }
      expect(
        isHealthy(
          { ...base, postsPerWeek: 3, lastPostAt: new Date('2026-10-10') },
          now
        )
      ).to.be.true
      expect(
        isHealthy(
          { ...base, postsPerWeek: 3, lastPostAt: new Date('2026-06-01') },
          now
        )
      ).to.be.false
      expect(
        isHealthy(
          { ...base, postsPerWeek: 80, lastPostAt: new Date('2026-10-11') },
          now
        )
      ).to.be.false
    })
  })

  describe('looksLikePerson', () => {
    it('accepts names and rejects mastheads', () => {
      expect(looksLikePerson('Brian Potter')).to.be.true
      expect(looksLikePerson('By Maria Popova')).to.be.true
      expect(looksLikePerson('Staff')).to.be.false
      expect(looksLikePerson('The Editors')).to.be.false
    })
  })

  describe('pickVaried', () => {
    it('keeps at most two per guide', () => {
      const picked = pickVaried([
        { score: 0.9, leadGuide: 'a' },
        { score: 0.8, leadGuide: 'a' },
        { score: 0.7, leadGuide: 'a' },
        { score: 0.6, leadGuide: 'b' },
      ])
      expect(picked.map((p) => p.score)).to.eql([0.9, 0.8, 0.6])
    })
  })

  describe('nudgeGuide', () => {
    it('stays within its bounds', () => {
      expect(nudgeGuide(1.95, true)).to.eql(2)
      expect(nudgeGuide(0.35, false)).to.eql(0.3)
      expect(nudgeGuide(1, true)).to.be.closeTo(1.15, 0.001)
    })
  })

  describe('buildReadingGraph', () => {
    const subscriptions = [
      sub('https://daringfireball.net/feeds/main', 'Daring Fireball'),
      sub('https://kottke.org/feed', 'Kottke'),
      sub(
        'https://oldfeed.example.org/rss',
        'Old',
        SubscriptionStatus.Unsubscribed
      ),
    ]

    it('weights links by what you did with each article', () => {
      const a = item({ progress: 100 })
      const b = item({
        highlights: 1,
        subscription: 'https://kottke.org/feed',
        originalUrl: 'https://kottke.org/x',
      })
      const c = item({})
      const graph = buildReadingGraph(
        {
          items: [a, b, c],
          links: [
            { id: a.id, host: 'sixcolors.com' },
            { id: b.id, host: 'www.sixcolors.com' },
            { id: c.id, host: 'sixcolors.com' },
            { id: a.id, host: 'twitter.com' },
            { id: a.id, host: 'kottke.org' },
            { id: a.id, host: 'oldfeed.example.org' },
          ],
          subscriptions,
        },
        new Map()
      )
      const six = graph.candidates.find((c) => c.site === 'sixcolors.com')
      expect(six).to.exist
      // finished (3) + skipped (0.3) from Daring Fireball, highlighted (4) from Kottke
      expect(
        six?.edges.get('https://daringfireball.net/feeds/main')?.weight
      ).to.be.closeTo(3.3, 0.01)
      expect(six?.edges.get('https://kottke.org/feed')?.weight).to.eql(4)
      // platforms, followed feeds and feeds you left are never candidates
      const sites = graph.candidates.map((c) => c.site)
      expect(sites).to.not.include('twitter.com')
      expect(sites).to.not.include('kottke.org')
      expect(sites).to.not.include('example.org')
    })

    it('counts sites you save from and writers you finish', () => {
      const saves = [1, 2, 3].map((n) =>
        item({
          folder: 'inbox',
          subscription: null,
          originalUrl: `https://www.ben-evans.com/post-${n}`,
          author: 'Brian Potter',
          progress: 100,
        })
      )
      const graph = buildReadingGraph(
        { items: saves, links: [], subscriptions },
        new Map()
      )
      const ben = graph.candidates.find((c) => c.site === 'ben-evans.com')
      expect(ben?.saves).to.eql(3)
      expect(graph.writers.get('brian potter')?.count).to.eql(3)
    })

    it('finds related publishers when recent articles have no links', () => {
      const graph = buildReadingGraph(
        {
          items: [],
          links: [],
          subscriptions: [
            sub('https://daringfireball.net/feeds/main', 'Daring Fireball'),
          ],
        },
        new Map()
      )
      const candidate = graph.candidates.find((c) => c.site === 'ben-evans.com')
      expect(candidate?.catalogFeedUrl).to.eql(
        'https://www.ben-evans.com/benedictevans?format=rss'
      )
      expect(candidate?.similar.has('https://daringfireball.net/feeds/main')).to
        .be.true
      const now = new Date('2026-10-12T00:00:00Z')
      const scored = scoreCandidate(
        candidate!,
        {
          feedUrl: candidate!.catalogFeedUrl!,
          siteUrl: 'https://ben-evans.com/',
          postsPerWeek: 1,
          lastPostAt: new Date('2026-10-10T00:00:00Z'),
          latest: [],
          outHosts: [],
          hasFullText: false,
          hasImages: false,
          words: '',
        },
        graph,
        () => 1,
        now
      )
      expect(scored.score).to.be.greaterThan(SCORE_FLOOR)
      expect(scored.reasons[0].kind).to.eql('similar')
      expect(graph.candidates.map((c) => c.site)).not.to.include(
        'daringfireball.net'
      )
    })
  })

  describe('reading a site', () => {
    it('reads a known feed without needing a discoverable home page', async () => {
      const now = new Date('2026-10-12T00:00:00Z')
      const feedUrl = 'https://example.com/custom.xml'
      const visited: string[] = []
      const feed = await findSiteFeed(
        'example.com',
        {
          used: () => visited.length,
          get: async (url) => {
            visited.push(url)
            return {
              data: `<rss version="2.0"><channel><title>Example</title><link>https://example.com/</link><item><title>Latest</title><link>https://example.com/latest</link><pubDate>Sat, 10 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`,
              contentType: 'application/rss+xml',
            }
          },
        },
        now,
        feedUrl
      )
      expect(feed?.title).to.eql('Example')
      expect(visited).to.eql([feedUrl])
    })

    it('finds advertised feeds and skips comment feeds', () => {
      const links = feedLinksIn(
        `<html><head>
          <link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed">
          <link rel="alternate" type="application/rss+xml" title="Six Colors" href="/feed/">
        </head></html>`,
        'https://sixcolors.com/'
      )
      expect(links).to.eql(['https://sixcolors.com/feed/'])
    })

    it('reads a feed and scores it', async () => {
      const now = new Date('2026-10-12T00:00:00Z')
      const body =
        '<p>' +
        'word '.repeat(400) +
        '<a href="https://kottke.org/x">k</a> <img src="https://img.example/a.jpg"></p>'
      const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
        <title>Six Colors</title><link>https://sixcolors.com/</link><description>Apple, technology</description>
        <item><title>The Mac’s quiet year</title><link>https://sixcolors.com/a</link><pubDate>Sat, 10 Oct 2026 10:00:00 GMT</pubDate><dc:creator>Jason Snell</dc:creator><content:encoded><![CDATA[${body}]]></content:encoded></item>
        <item><title>Living with the iPad keyboard</title><link>https://sixcolors.com/b</link><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate><dc:creator>Jason Snell</dc:creator><content:encoded><![CDATA[${body}]]></content:encoded></item>
      </channel></rss>`
      const feed = await readFeed(
        xml,
        'https://sixcolors.com/feed/',
        'https://sixcolors.com/',
        now
      )
      expect(feed?.title).to.eql('Six Colors')
      expect(feed?.author).to.eql('Jason Snell')
      expect(feed?.latest[0].title).to.eql('The Mac’s quiet year')
      expect(feed?.latest[0].image).to.eql('https://img.example/a.jpg')
      expect(feed?.latest[0].minutes).to.be.greaterThan(0)
      expect(feed?.outHosts).to.include('kottke.org')
      expect(feed?.hasFullText).to.be.true

      const a = item({ progress: 100, title: 'Mac quiet year review' })
      const graph = buildReadingGraph(
        {
          items: [a],
          links: [{ id: a.id, host: 'sixcolors.com' }],
          subscriptions: [
            sub('https://daringfireball.net/feeds/main', 'Daring Fireball'),
          ],
        },
        new Map()
      )
      const candidate = graph.candidates[0]
      const scored = scoreCandidate(candidate, feed!, graph, () => 1, now)
      expect(scored.score).to.be.greaterThan(0)
      expect(scored.reasons[0]).to.include({
        kind: 'link',
        guideName: 'Daring Fireball',
        count: 1,
      })
      expect(scored.signals.taste).to.be.greaterThan(0)
    })
  })
})
