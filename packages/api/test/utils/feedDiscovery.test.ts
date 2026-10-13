import { expect } from 'chai'
import 'mocha'
import {
  addBlogrolls,
  buildReadingGraph,
  feedLinksIn,
  findSiteFeed,
  readFeed,
  scoreCandidate,
} from '../../src/services/feed_suggestions'
import {
  blogrollFromOpml,
  blogrollFromPage,
  blogrollLinkIn,
  blogrollWeight,
  engagementOf,
  isHealthy,
  isPlatformHost,
  linkHosts,
  looksLikePerson,
  needsTopUp,
  nudgeGuide,
  pickVaried,
  postsPerWeek,
  ReadItem,
  SCORE_FLOOR,
  siteOf,
  TOP_UP_BELOW,
  TOP_UP_GAP_MS,
  youtubeChannelKey,
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

  describe('needsTopUp', () => {
    const now = new Date('2026-10-13T09:00:00Z')
    const ago = (ms: number) => new Date(now.getTime() - ms)

    it('looks for more once few suggestions are left', () => {
      expect(needsTopUp(TOP_UP_BELOW - 1, ago(TOP_UP_GAP_MS), now)).to.be.true
      expect(needsTopUp(0, undefined, now)).to.be.true
    })

    it('waits while plenty are left', () => {
      expect(needsTopUp(TOP_UP_BELOW, ago(TOP_UP_GAP_MS * 10), now)).to.be.false
    })

    it('looks at most every half hour', () => {
      expect(needsTopUp(0, ago(TOP_UP_GAP_MS - 1000), now)).to.be.false
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

    it('uses the full-size picture from feed content instead of a thumbnail', async () => {
      const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel>
        <title>Example</title><link>https://example.com/</link><description>Example feed</description>
        <item><title>Story</title><link>https://example.com/story</link>
        <media:thumbnail url="https://example.com/tiny.jpg" />
        <content:encoded><![CDATA[<img src="https://example.com/placeholder.jpg" srcset="/story-320.jpg 320w, /story-1200.jpg 1200w">]]></content:encoded>
        </item></channel></rss>`
      const feed = await readFeed(
        xml,
        'https://example.com/feed',
        'https://example.com/'
      )
      expect(feed?.latest[0].image).to.eql('https://example.com/story-1200.jpg')
    })
  })

  describe('blogrolls', () => {
    it('finds an OPML blogroll first, then a blogroll page', () => {
      expect(
        blogrollLinkIn(
          `<link rel="blogroll" type="text/xml" href="/blogroll.opml">
           <a href="/blogroll/">Blogroll</a>`,
          'https://kottke.org/'
        )
      ).to.eql({ opml: 'https://kottke.org/blogroll.opml' })
      expect(
        blogrollLinkIn(
          `<a href="https://elsewhere.com/blogroll">Blogroll</a>
           <a href="/links/">My blog roll</a>`,
          'https://kottke.org/'
        )
      ).to.eql({ page: 'https://kottke.org/links/' })
      expect(blogrollLinkIn('<a href="/about">About</a>', 'https://a.com/')).to
        .be.empty
    })

    it('reads the sites an OPML file lists', () => {
      const sites = blogrollFromOpml(`<opml><body>
        <outline text="Six Colors" xmlUrl="https://sixcolors.com/feed/" htmlUrl="https://sixcolors.com/"/>
        <outline text="Six Colors again" xmlUrl="https://sixcolors.com/feed.xml"/>
        <outline text="Someone on X" htmlUrl="https://x.com/someone"/>
        <outline title="Robin &amp; Co" xmlUrl="https://www.robinsloan.com/feed.xml"/>
      </body></opml>`)
      expect(sites).to.eql([
        {
          site: 'sixcolors.com',
          host: 'sixcolors.com',
          feedUrl: 'https://sixcolors.com/feed/',
          name: 'Six Colors',
        },
        {
          site: 'robinsloan.com',
          host: 'robinsloan.com',
          feedUrl: 'https://www.robinsloan.com/feed.xml',
          name: 'Robin & Co',
        },
      ])
    })

    it('reads the sites a blogroll page links to', () => {
      const sites = blogrollFromPage(
        `<header><a href="https://twitter.com/me">me</a><a href="https://shop.example/">Shop</a></header>
         <main><a href="/about">About</a>
         <a href="https://sixcolors.com/">Six Colors</a>
         <a href="https://www.macstories.net/">MacStories</a>
         <a href="https://github.com/me">GitHub</a></main>`,
        'https://kottke.org/blogroll/'
      )
      expect(sites.map((s) => s.site)).to.eql([
        'sixcolors.com',
        'macstories.net',
      ])
      expect(sites[1].name).to.eql('MacStories')
    })

    it('weighs a short blogroll more than a long one', () => {
      expect(blogrollWeight(10)).to.be.greaterThan(blogrollWeight(60))
      expect(blogrollWeight(0)).to.eql(0)
    })

    it('adds blogroll sites as candidates with a blogroll reason', async () => {
      const a = item({ progress: 100 })
      const graph = addBlogrolls(
        buildReadingGraph(
          {
            items: [a],
            links: [],
            subscriptions: [
              sub('https://daringfireball.net/feeds/main', 'Daring Fireball'),
            ],
          },
          new Map()
        ),
        new Map([
          [
            'https://daringfireball.net/feeds/main',
            [
              { site: 'sixcolors.com', host: 'sixcolors.com' },
              // followed already
              { site: 'daringfireball.net', host: 'daringfireball.net' },
            ],
          ],
        ]),
        new Map()
      )
      const sites = graph.candidates.map((c) => c.site)
      expect(sites).to.include('sixcolors.com')
      expect(sites).not.to.include('daringfireball.net')
      expect(graph.leading[0]).to.deep.include({ host: 'daringfireball.net' })

      const now = new Date('2026-10-12T00:00:00Z')
      const scored = scoreCandidate(
        graph.candidates.find((c) => c.site == 'sixcolors.com')!,
        {
          feedUrl: 'https://sixcolors.com/feed/',
          siteUrl: 'https://sixcolors.com/',
          postsPerWeek: 5,
          lastPostAt: new Date('2026-10-10T00:00:00Z'),
          latest: [],
          outHosts: [],
          hasFullText: true,
          hasImages: false,
          words: '',
        },
        graph,
        () => 1,
        now
      )
      expect(scored.reasons[0]).to.include({
        kind: 'blogroll',
        guideName: 'Daring Fireball',
      })
      expect(scored.signals.links).to.be.greaterThan(0)
    })
  })

  describe('YouTube channels', () => {
    it('keys channel links by handle or channel ID', () => {
      expect(youtubeChannelKey('@Veritasium')).to.eql('youtube.com/@veritasium')
      expect(youtubeChannelKey('@veritasium/videos')).to.eql(
        'youtube.com/@veritasium'
      )
      expect(youtubeChannelKey('channel/UCHnyfMqiRRG1u-2MsSQLbXA')).to.eql(
        'youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA'
      )
      expect(youtubeChannelKey('watch?v=abc')).to.be.undefined
    })

    it('turns channel links in articles into candidates', () => {
      const a = item({ progress: 100 })
      const graph = buildReadingGraph(
        {
          items: [a],
          links: [],
          channelLinks: [{ id: a.id, path: '@Veritasium' }],
          subscriptions: [
            sub('https://daringfireball.net/feeds/main', 'Daring Fireball'),
            sub(
              'https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA',
              'Veritasium'
            ),
          ],
        },
        new Map()
      )
      expect(graph.candidates.map((c) => c.site)).to.include(
        'youtube.com/@veritasium'
      )
      expect([...graph.followedChannels]).to.eql(['UCHnyfMqiRRG1u-2MsSQLbXA'])
    })
  })
})
