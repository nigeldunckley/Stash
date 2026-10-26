// Run with: node --test packages/api/test/youtube/official-youtube.test.cjs
// Uses the production SQL against ephemeral PostgreSQL (PGlite), never a live account.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const babel = require('@babel/core')
const { PGlite } = require('@electric-sql/pglite')
const base = path.resolve(__dirname, '../../src/services/youtube')
function load(file, stubs = {}) {
  const filename = path.join(base, file + '.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = mod.require.bind(mod)
  mod.require = (id) => (Object.hasOwn(stubs, id) ? stubs[id] : original(id))
  mod._compile(
    babel.transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      configFile: false,
      babelrc: false,
      presets: [
        [
          '@babel/preset-env',
          { targets: { node: 'current' }, modules: 'commonjs' },
        ],
        '@babel/preset-typescript',
      ],
    }).code,
    filename
  )
  return mod.exports
}
const security = load('security')
process.env.YOUTUBE_CREDENTIAL_KEY = Buffer.alloc(32, 7).toString('base64')
process.env.YOUTUBE_API_KEY = 'fixture'
process.env.YOUTUBE_CLIENT_ID = 'fixture'
process.env.YOUTUBE_CLIENT_SECRET = 'fixture'
const uid = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const channel = (n) => 'UC' + String(n).padStart(22, '0')
class Unavailable extends Error {}
class Redis {
  data = new Map()
  async get(k) {
    return this.data.get(k) || null
  }
  async getdel(k) {
    const v = await this.get(k)
    this.data.delete(k)
    return v
  }
  async set(k, v, ...args) {
    if (args.includes('NX') && this.data.has(k)) return null
    this.data.set(k, v)
    return 'OK'
  }
  async del(k) {
    return this.data.delete(k) ? 1 : 0
  }
  async exists(k) {
    return this.data.has(k) ? 1 : 0
  }
  async eval(_code, _n, k, v) {
    if (this.data.get(k) === v) this.data.delete(k)
  }
}
async function fixture() {
  const db = new PGlite()
  await db.exec(`CREATE SCHEMA omnivore; CREATE ROLE omnivore_user; CREATE FUNCTION omnivore.get_current_user_id() RETURNS uuid LANGUAGE sql AS $$SELECT current_setting('test.uid',true)::uuid$$;
    CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$SELECT gen_random_uuid()$$;
    CREATE TYPE subscription_status_type AS ENUM ('ACTIVE','UNSUBSCRIBED','DELETED');
    CREATE TABLE omnivore.user(id uuid PRIMARY KEY);
    INSERT INTO omnivore.user VALUES('${uid}'),('${other}');
    CREATE TABLE omnivore.subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES omnivore.user(id),name text,url text,icon text,type text,status subscription_status_type DEFAULT 'ACTIVE',folder text,UNIQUE(user_id,url));
    CREATE TABLE omnivore.library_item(id uuid PRIMARY KEY);`)
  await db.exec(
    fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../db/migrations/0195.do.youtube_connection.sql'
      ),
      'utf8'
    )
  )
  const query = async (sql, args = []) => (await db.query(sql, args)).rows
  const redis = new Redis(),
    queued = [],
    calls = []
  let response = async () => ({ items: [] }),
    channelsFail = false,
    invalidGrant = false
  class OAuth {
    credentials = {}
    setCredentials(c) {
      this.credentials = c
    }
    async getAccessToken() {
      if (invalidGrant) throw { response: { data: { error: 'invalid_grant' } } }
      return { token: 'access-fixture' }
    }
    async revokeToken() {}
    generateAuthUrl(options) {
      calls.push(options)
      return `https://accounts.google.com/auth?state=${options.state}`
    }
    async getToken() {
      return {
        tokens: {
          access_token: 'access-fixture',
          refresh_token: 'refresh-fixture',
          scope: 'https://www.googleapis.com/auth/youtube.readonly',
        },
      }
    }
  }
  const service = load('connection', {
    googleapis: { google: { auth: { OAuth2: OAuth } } },
    '../../env': { env: { client: { url: 'https://stash.example' } } },
    '../../redis_data_source': { redisDataSource: { redisClient: redis } },
    '../../repository': {
      authTrx: async (fn) =>
        db.transaction((tx) =>
          fn({ query: async (sql, args) => (await tx.query(sql, args)).rows })
        ),
    },
    './security': security,
    './client': {
      YouTubeUnavailableError: Unavailable,
      configuredPublic: () => true,
      thumbnail: () => undefined,
      youtubeList: (...args) => response(...args),
      channels: async (ids) => {
        if (channelsFail)
          throw new Unavailable('Temporary public lookup failure')
        return ids.map((id) => ({ id, snippet: { title: `Channel ${id}` } }))
      },
    },
    '../../queue-processor': {
      getQueue: async () => ({
        add: async (name, data) => queued.push({ name, data }),
      }),
    },
  })
  await query(
    `INSERT INTO omnivore.youtube_connections(user_id,channel_id,channel_title,credentials) VALUES($1,$2,'My channel',$3)`,
    [
      uid,
      channel(999),
      security.encryptCredentials({ refresh_token: 'fixture' }, uid),
    ]
  )
  return {
    db,
    query,
    redis,
    queued,
    calls,
    service,
    response: (f) => {
      response = f
    },
    failChannels: () => {
      channelsFail = true
    },
    revoke: () => {
      invalidGrant = true
    },
  }
}

test('credentials are randomized, authenticated and bound to their owner', () => {
  const a = security.encryptCredentials({ refresh_token: 'secret' }, uid)
  const b = security.encryptCredentials({ refresh_token: 'secret' }, uid)
  assert.notEqual(a, b)
  assert.equal(a.includes('secret'), false)
  assert.deepEqual(security.decryptCredentials(a, uid), {
    refresh_token: 'secret',
  })
  assert.throws(() => security.decryptCredentials(a, other))
  assert.throws(() => security.decryptCredentials(a.slice(0, -4) + 'AAAA', uid))
})
test('duration boundaries distinguish 179, 180 and 181 seconds', () => {
  assert.equal(security.durationSeconds('PT2M59S'), 179)
  assert.equal(security.durationSeconds('P1DT1H2M3S'), 90123)
  assert.equal(security.shouldImportVideo(179, true), false)
  assert.equal(security.shouldImportVideo(180, true), true)
  assert.equal(security.shouldImportVideo(181, true), true)
  assert.equal(security.shouldImportVideo(1, false), true)
})
test('migration, >50 subscriptions, overlaps, exclusions and complete-snapshot removals', async () => {
  const f = await fixture()
  try {
    await f.query(
      `INSERT INTO omnivore.subscriptions(user_id,name,url,type,youtube_channel_id,youtube_manual_follow,youtube_imported,youtube_excluded,status) VALUES
      ($1,'Manual',$2,'RSS',$3,true,true,false,'ACTIVE'),
      ($1,'Removed',$4,'RSS',$5,false,true,false,'ACTIVE'),
      ($1,'Excluded',$6,'RSS',$7,false,true,true,'UNSUBSCRIBED')`,
      [
        uid,
        `https://www.youtube.com/feeds/videos.xml?channel_id=${channel(1)}`,
        channel(1),
        `https://www.youtube.com/feeds/videos.xml?channel_id=${channel(2)}`,
        channel(2),
        `https://www.youtube.com/feeds/videos.xml?channel_id=${channel(3)}`,
        channel(3),
      ]
    )
    let pages = 0
    f.response(async (_r, p) => {
      pages++
      return {
        items: Array.from({ length: p.pageToken ? 5 : 50 }, (_, n) => ({
          snippet: {
            resourceId: { channelId: channel(n + (p.pageToken ? 54 : 3)) },
          },
        })),
        nextPageToken: p.pageToken ? undefined : 'second',
      }
    })
    await f.service.syncSubscriptions(uid)
    assert.equal(pages, 2)
    const rows = await f.query(
      'SELECT * FROM omnivore.subscriptions ORDER BY youtube_channel_id'
    )
    assert.equal(rows.find((r) => r.name === 'Manual').status, 'ACTIVE')
    assert.equal(rows.find((r) => r.name === 'Manual').youtube_imported, false)
    assert.equal(rows.find((r) => r.name === 'Removed').status, 'UNSUBSCRIBED')
    assert.equal(rows.find((r) => r.name === 'Excluded').status, 'UNSUBSCRIBED')
    assert.equal(rows.filter((r) => r.youtube_imported).length, 55)
    // Channels are checked by the free feed sweep, not one API refresh each.
    assert.equal(
      f.queued.filter((j) => j.name === 'youtube-refresh-channel').length,
      0
    )
    const count = rows.length
    await f.service.syncSubscriptions(uid)
    assert.equal(
      (await f.query('SELECT * FROM omnivore.subscriptions')).length,
      count
    )
    assert.equal((await f.service.connectionStatus(other)).connected, false)
    await f.service.disconnect(uid)
    assert.equal(
      (await f.query('SELECT * FROM omnivore.youtube_connections')).length,
      0
    )
    assert.equal(
      (await f.query('SELECT * FROM omnivore.subscriptions')).length,
      1
    )
    assert.equal(
      (await f.query('SELECT * FROM omnivore.subscriptions'))[0].name,
      'Manual'
    )
  } finally {
    await f.db.close()
  }
})
test('failed pages and failed metadata leave prior follows and sync checkpoint intact', async () => {
  const f = await fixture()
  try {
    await f.query(
      `INSERT INTO omnivore.subscriptions(user_id,name,url,type,youtube_channel_id,youtube_manual_follow,youtube_imported) VALUES($1,'Keep me','feed','RSS',$2,false,true)`,
      [uid, channel(1)]
    )
    f.response(async (_r, p) => {
      if (p.pageToken) throw new Unavailable('Offline')
      return {
        items: [{ snippet: { resourceId: { channelId: channel(2) } } }],
        nextPageToken: 'next',
      }
    })
    await assert.rejects(f.service.syncSubscriptions(uid))
    let row = (await f.query('SELECT * FROM omnivore.subscriptions'))[0]
    assert.equal(row.youtube_imported, true)
    assert.equal(row.status, 'ACTIVE')
    assert.equal((await f.service.getConnection(uid)).synced_at, null)
    f.response(async () => ({
      items: [{ snippet: { resourceId: { channelId: channel(2) } } }],
    }))
    f.failChannels()
    await assert.rejects(f.service.syncSubscriptions(uid))
    assert.equal(
      (await f.query('SELECT * FROM omnivore.subscriptions')).length,
      1
    )
  } finally {
    await f.db.close()
  }
})
test('authorization cancellation, replay, replacement and disconnect invalidate attempts', async () => {
  const f = await fixture()
  try {
    const state = (
      await f.service.beginAuthorization(uid)
    ).authorizationUrl.split('state=')[1]
    assert.equal(f.calls[0].access_type, 'offline')
    assert.deepEqual(f.calls[0].scope, [
      'https://www.googleapis.com/auth/youtube.readonly',
    ])
    await assert.rejects(
      f.service.completeAuthorization(state, undefined, true),
      /cancelled/
    )
    await assert.rejects(
      f.service.completeAuthorization(state, 'code'),
      /expired/
    )
    const first = (
      await f.service.beginAuthorization(uid)
    ).authorizationUrl.split('state=')[1]
    const second = (
      await f.service.beginAuthorization(uid)
    ).authorizationUrl.split('state=')[1]
    await assert.rejects(
      f.service.completeAuthorization(first, 'code'),
      /expired/
    )
    await f.service.disconnect(uid)
    await assert.rejects(
      f.service.completeAuthorization(second, 'code'),
      /expired/
    )
  } finally {
    await f.db.close()
  }
})
test('revoked refresh token removes imported relationships and retains reconnect state', async () => {
  const f = await fixture()
  try {
    await f.query(
      `INSERT INTO omnivore.subscriptions(user_id,name,url,type,youtube_channel_id,youtube_manual_follow,youtube_imported) VALUES($1,'Private source','feed','RSS',$2,false,true)`,
      [uid, channel(1)]
    )
    f.revoke()
    await assert.rejects(f.service.syncSubscriptions(uid))
    assert.equal(
      (await f.query('SELECT * FROM omnivore.subscriptions')).length,
      0
    )
    const c = await f.service.getConnection(uid)
    assert.equal(c.credentials, '')
    assert.equal(c.channel_title, '')
    assert.match(c.error, /revoked/)
    assert.equal((await f.service.connectionStatus(uid)).connected, false)
  } finally {
    await f.db.close()
  }
})

test('upload backfill paginates, filters duration, deduplicates and retains checkpoints on save failure', async () => {
  const f = await fixture()
  try {
    const channelId = channel(33),
      now = new Date(),
      day = 86400000
    const source = {
      id: 'source',
      user: { id: uid },
      status: 'ACTIVE',
      youtubeExcluded: false,
      youtubeChannelId: channelId,
      hideShortVideos: true,
      url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    }
    let subscriptions = [source],
      failSave = false,
      pages = 0,
      saves = [],
      saved = new Set()
    const resources = [179, 180, 181].map((seconds, i) => ({
      id: String(i).padStart(11, '0'),
      snippet: {
        channelId,
        channelTitle: 'A channel',
        title: `Video ${seconds}`,
        publishedAt: new Date(now - day).toISOString(),
        liveBroadcastContent: 'none',
      },
      contentDetails: { duration: `PT${seconds}S` },
      status: { embeddable: true, madeForKids: false },
    }))
    const old = {
      ...resources[2],
      id: 'old00000000',
      snippet: {
        ...resources[2].snippet,
        publishedAt: new Date(now - 8 * day).toISOString(),
      },
    }
    const subscriptionRepo = {
      find: async () => subscriptions,
      findOneBy: async () => subscriptions[0],
      update: async (_where, changes) => Object.assign(source, changes),
    }
    const c = {
      id: channelId,
      snippet: { title: 'A channel' },
      contentDetails: { relatedPlaylists: { uploads: 'uploads' } },
    }
    const ingest = load('ingestion', {
      axios: { post: async () => ({ status: 202 }) },
      '../../data_source': {
        appDataSource: {
          query: f.query,
          // Cross-user library lookups run as admin; no library rows here.
          transaction: async (work) => work({ query: async () => [] }),
          getRepository: (entity) =>
            entity === 'Subscription'
              ? subscriptionRepo
              : { find: async () => [] },
        },
      },
      '../../entity/library_item': { LibraryItem: 'LibraryItem' },
      '../../entity/subscription': {
        Subscription: 'Subscription',
        SubscriptionStatus: { Active: 'ACTIVE' },
      },
      '../../env': { env: { client: { url: 'https://stash.example' } } },
      '../../redis_data_source': { redisDataSource: { redisClient: f.redis } },
      '../../repository': {
        authTrx: () => {
          throw Error('Unexpected transaction')
        },
      },
      '../library_item': {
        hasFeedItem: async (_u, _feed, url) => saved.has(url),
        updateLibraryItem: async () => undefined,
      },
      '../save_page': {
        savePage: async (input) => {
          if (failSave) return { __typename: 'SaveError' }
          saves.push(input)
          saved.add(input.url)
          return { __typename: 'SaveSuccess' }
        },
      },
      '../cached_reading_position': {
        clearCachedReadingPosition: async () => true,
      },
      '../user': { findActiveUser: async () => ({ id: uid }) },
      '../../utils/youtubeChannel': {
        channelFeedUrl: (id) => `feed:${id}`,
        videoDocument: () => 'document',
        watchUrl: (id) => `https://www.youtube.com/watch?v=${id}`,
      },
      '../../utils/logger': { logger: { warning() {} } },
      './connection': { queueYouTube: async () => {} },
      './security': security,
      './client': {
        configuredPublic: () => true,
        channels: async () => [c],
        thumbnail: () => 'thumb',
        videoDuration: (v) =>
          security.durationSeconds(v.contentDetails.duration),
        finishedVideo: (v) => v.snippet.liveBroadcastContent === 'none',
        isShortVideo: () => false,
        videos: async (ids) =>
          [...resources, old].filter((v) => ids.includes(v.id)),
        youtubeList: async (_r, p) => {
          pages++
          return p.pageToken
            ? {
                items: [
                  {
                    contentDetails: {
                      videoId: resources[2].id,
                      videoPublishedAt: resources[2].snippet.publishedAt,
                    },
                  },
                  {
                    contentDetails: {
                      videoId: old.id,
                      videoPublishedAt: old.snippet.publishedAt,
                    },
                  },
                ],
              }
            : {
                items: resources.slice(0, 2).map((v) => ({
                  contentDetails: {
                    videoId: v.id,
                    videoPublishedAt: v.snippet.publishedAt,
                  },
                })),
                nextPageToken: 'next',
              }
        },
      },
    })
    await ingest.refreshChannel(channelId)
    assert.equal(pages, 2)
    assert.equal(saves.length, 2)
    assert.equal(
      saves.some((v) => v.title === 'Video 179'),
      false
    )
    assert.ok(source.youtubeInitializedAt)
    await ingest.refreshChannel(channelId)
    assert.equal(saves.length, 2)
    const checkpoint = source.mostRecentItemDate.getTime()
    resources[2].snippet.publishedAt = new Date(
      now.getTime() + day
    ).toISOString()
    source.youtubeCheckpointAt = new Date(now.getTime() - 2 * day)
    saved.clear()
    failSave = true
    await assert.rejects(
      ingest.refreshChannel(channelId),
      /checkpoint retained/
    )
    assert.equal(source.mostRecentItemDate.getTime(), checkpoint)
    subscriptions = []
    await ingest.refreshChannel(channelId)
    assert.equal(saves.length, 2)
  } finally {
    await f.db.close()
  }
})

test('quota accounting shares budgets, caches searches and rejects exhausted requests', async () => {
  const redis = new Redis()
  redis.incr = async (k) => {
    const n = Number((await redis.get(k)) || 0) + 1
    redis.data.set(k, String(n))
    return n
  }
  redis.expire = async () => 1
  let requests = 0
  const client = load('client', {
    './security': security,
    axios: {
      get: async (url) => {
        requests++
        return {
          data: url.endsWith('/search')
            ? { items: [{ id: { channelId: channel(1) } }] }
            : { items: [{ id: channel(1), snippet: { title: 'Example' } }] },
        }
      },
    },
    '../../redis_data_source': { redisDataSource: { redisClient: redis } },
  })
  process.env.YOUTUBE_SEARCH_DAILY_LIMIT = '1'
  await client.searchChannels('A channel', 6)
  await client.searchChannels('a channel', 6)
  assert.equal(requests, 2)
  await assert.rejects(client.searchChannels('different', 6), /quota/)
  assert.equal(requests, 2)
  delete process.env.YOUTUBE_SEARCH_DAILY_LIMIT
})

test('credentials table enforces account isolation at the database boundary', async () => {
  const f = await fixture()
  try {
    await f.db.exec(
      `GRANT USAGE ON SCHEMA omnivore TO omnivore_user; SET ROLE omnivore_user; SELECT set_config('test.uid','${other}',false);`
    )
    assert.equal(
      (await f.query('SELECT * FROM omnivore.youtube_connections')).length,
      0
    )
    await f.db.exec(`SELECT set_config('test.uid','${uid}',false)`)
    assert.equal(
      (await f.query('SELECT * FROM omnivore.youtube_connections')).length,
      1
    )
    await assert.rejects(
      f.query(
        `INSERT INTO omnivore.youtube_connections(user_id,channel_id,channel_title,credentials) VALUES($1,'id','title','token')`,
        [other]
      ),
      /row-level security/
    )
    await f.db.exec('RESET ROLE')
    await f.db.exec(
      fs.readFileSync(
        path.resolve(
          __dirname,
          '../../../db/migrations/0195.undo.youtube_connection.sql'
        ),
        'utf8'
      )
    )
    assert.equal(
      (
        await f.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='omnivore' AND table_name='subscriptions' AND column_name='youtube_channel_id'"
        )
      ).length,
      0
    )
  } finally {
    await f.db.close()
  }
})

test('HTTP endpoints require Stash auth and validate WebSub topic, signature and payload', async () => {
  const express = require('express')
  const crypto = require('node:crypto')
  const channelId = channel(33),
    token = 'callback-secret',
    secret = 'signature-secret'
  const queued = []
  const router = load('../../routers/youtube_router', {
    '../env': { env: { client: { url: 'https://stash.example' } } },
    '../data_source': {
      appDataSource: {
        query: async (sql) =>
          sql.startsWith('SELECT')
            ? [{ hub_token: token, hub_secret: secret }]
            : [],
      },
    },
    '../utils/auth': {
      getClaimsByToken: async (v) =>
        v === 'fixture-auth' ? { uid } : undefined,
    },
    '../utils/corsConfig': { corsConfig: {} },
    '../services/youtube/connection': {
      connectionStatus: async (owner) => ({ owner, configured: false }),
      beginAuthorization: async () => ({}),
      completeAuthorization: async () => {},
      disconnect: async () => {},
      queueYouTube: async (...args) => queued.push(args),
    },
    '../services/youtube/ingestion': {
      publicVideo: async () => undefined,
      playbackFlags: () => ({ youtubeAvailable: false }),
    },
    '../services/youtube/client': { YouTubeUnavailableError: Unavailable },
  })
  const app = express()
  app.use(express.json())
  app.use('/api/youtube', router.youtubeRouter())
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const origin = `http://127.0.0.1:${server.address().port}/api/youtube`
  try {
    assert.equal((await fetch(origin + '/status')).status, 401)
    const status = await fetch(origin + '/status', {
      headers: { authorization: 'fixture-auth' },
    })
    assert.equal(status.status, 200)
    assert.equal((await status.json()).owner, uid)
    assert.equal(status.headers.get('cache-control'), 'no-store')
    assert.equal(
      (
        await fetch(origin + '/sync', {
          method: 'POST',
          headers: {
            authorization: 'fixture-auth',
            'content-type': 'application/json',
            origin: 'https://evil.example',
          },
          body: '{}',
        })
      ).status,
      403
    )
    assert.equal(
      (
        await fetch(origin + '/sync', {
          method: 'POST',
          headers: {
            authorization: 'fixture-auth',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: '',
        })
      ).status,
      415
    )
    assert.equal(
      (
        await fetch(origin + '/video/not-an-id', {
          headers: { authorization: 'fixture-auth' },
        })
      ).status,
      400
    )
    const topic = encodeURIComponent(
      `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`
    )
    assert.equal(
      (
        await fetch(
          `${origin}/push/${channelId}/wrong?hub.mode=subscribe&hub.challenge=challenge&hub.topic=${topic}`
        )
      ).status,
      404
    )
    const verification = await fetch(
      `${origin}/push/${channelId}/${token}?hub.mode=subscribe&hub.challenge=challenge&hub.topic=${topic}`
    )
    assert.equal(await verification.text(), 'challenge')
    const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>abcdefghijk</yt:videoId><yt:channelId>${channelId}</yt:channelId></entry><entry><yt:videoId>abcdefghijk</yt:videoId><yt:channelId>${channelId}</yt:channelId></entry><entry><yt:videoId>foreign1234</yt:videoId><yt:channelId>${channel(
      44
    )}</yt:channelId></entry></feed>`
    const url = `${origin}/push/${channelId}/${token}`
    assert.equal(
      (
        await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/atom+xml',
            'x-hub-signature': 'sha1=forged',
          },
          body: xml,
        })
      ).status,
      403
    )
    assert.equal(queued.length, 0)
    const signature =
      'sha1=' + crypto.createHmac('sha1', secret).update(xml).digest('hex')
    assert.equal(
      (
        await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/atom+xml',
            'x-hub-signature': signature,
          },
          body: xml,
        })
      ).status,
      204
    )
    assert.equal(queued.length, 1)
    assert.equal(queued[0][1].videoId, 'abcdefghijk')
    assert.equal(queued[0][1].channelId, channelId)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('successful authorization stores only encrypted credentials and reconnect replaces one connection', async () => {
  const f = await fixture()
  try {
    f.response(async () => ({
      items: [{ id: channel(999), snippet: { title: 'My YouTube channel' } }],
    }))
    const before = await f.service.getConnection(uid)
    const state = (
      await f.service.beginAuthorization(uid)
    ).authorizationUrl.split('state=')[1]
    await f.service.completeAuthorization(state, 'authorization-code')
    const after = await f.service.getConnection(uid)
    assert.notEqual(after.generation, before.generation)
    assert.equal(after.credentials.includes('refresh-fixture'), false)
    assert.equal(
      security.decryptCredentials(after.credentials, uid).refresh_token,
      'refresh-fixture'
    )
    assert.equal(after.channel_title, 'My YouTube channel')
    assert.equal(
      (await f.query('SELECT * FROM omnivore.youtube_connections')).length,
      1
    )
    assert.equal(f.queued[0].name, 'youtube-sync-user')
    assert.equal((await f.service.connectionStatus(uid)).authorizing, false)
    await assert.rejects(
      f.service.completeAuthorization(state, 'authorization-code'),
      /expired/
    )
  } finally {
    await f.db.close()
  }
})
