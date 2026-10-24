// Run with: node --test packages/api/test/youtube/shorts.test.cjs
// Settings › Watch › Hide Shorts, against the production SQL in PGlite.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const babel = require('@babel/core')
const { PGlite } = require('@electric-sql/pglite')

function load(file, stubs = {}) {
  const filename = path.resolve(__dirname, '../../src', file + '.ts')
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

const shorts = load('services/youtube/shorts')
const security = load('services/youtube/security')
const client = load('services/youtube/client', {
  './security': security,
  axios: {},
  '../../redis_data_source': { redisDataSource: {} },
})

const uid = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'

async function fixture() {
  const db = new PGlite()
  await db.exec(`CREATE SCHEMA omnivore;
    CREATE TABLE omnivore.library_item(id text PRIMARY KEY, user_id uuid, original_url text, folder text);
    CREATE TABLE omnivore.user_personalization(user_id uuid UNIQUE, fields json);`)
  await db.exec(
    `INSERT INTO omnivore.library_item VALUES
      ('feed-video', '${uid}', 'https://www.youtube.com/watch?v=aaaaaaaaaaa', 'following'),
      ('feed-short', '${uid}', 'https://www.youtube.com/watch?v=bbbbbbbbbbb', 'following'),
      ('rss-short', '${uid}', 'https://www.youtube.com/shorts/ccccccccccc', 'following'),
      ('saved-short', '${uid}', 'https://youtube.com/shorts/ddddddddddd', 'inbox'),
      ('article', '${uid}', 'https://example.com/shorts/story', 'following'),
      ('other-short', '${other}', 'https://www.youtube.com/shorts/eeeeeeeeeee', 'following')`
  )
  await db.exec(
    fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../db/migrations/0196.do.youtube_shorts.sql'
      ),
      'utf8'
    )
  )
  // The maintenance job marks Shorts saved under watch URLs.
  await db.exec(
    "UPDATE omnivore.library_item SET youtube_short = (id = 'feed-short') WHERE id IN ('feed-video', 'feed-short')"
  )
  const visible = async (userId) =>
    (
      await db.query(
        `SELECT id FROM omnivore.library_item WHERE user_id = $1 AND ${shorts.HIDE_SHORTS_SQL} ORDER BY id`,
        [userId]
      )
    ).rows.map((row) => row.id)
  const setFields = (userId, fields) =>
    db.query(
      'INSERT INTO omnivore.user_personalization VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET fields = excluded.fields',
      [userId, JSON.stringify(fields)]
    )
  return { db, visible, setFields }
}

test('migration marks /shorts/ links and leaves other items unchecked', async () => {
  const f = await fixture()
  try {
    const rows = (
      await f.db.query(
        "SELECT id, youtube_short FROM omnivore.library_item WHERE id IN ('rss-short', 'saved-short', 'article') ORDER BY id"
      )
    ).rows
    assert.deepEqual(rows, [
      { id: 'article', youtube_short: null },
      { id: 'rss-short', youtube_short: true },
      { id: 'saved-short', youtube_short: true },
    ])
    await f.db.exec(
      fs.readFileSync(
        path.resolve(
          __dirname,
          '../../../db/migrations/0196.undo.youtube_shorts.sql'
        ),
        'utf8'
      )
    )
  } finally {
    await f.db.close()
  }
})

test('Shorts from channels are hidden by default, saved ones stay', async () => {
  const f = await fixture()
  try {
    const all = ['article', 'feed-video', 'saved-short']
    // No personalization row at all.
    assert.deepEqual(await f.visible(uid), all)
    // Other settings, nothing about Shorts.
    await f.setFields(uid, { watch: { collections: ['x'] } })
    assert.deepEqual(await f.visible(uid), all)
    await f.setFields(uid, { watch: { hideShorts: true } })
    assert.deepEqual(await f.visible(uid), all)
  } finally {
    await f.db.close()
  }
})

test('switching Hide Shorts off brings them back for that account only', async () => {
  const f = await fixture()
  try {
    await f.setFields(uid, { watch: { hideShorts: false } })
    assert.deepEqual(await f.visible(uid), [
      'article',
      'feed-short',
      'feed-video',
      'rss-short',
      'saved-short',
    ])
    assert.deepEqual(await f.visible(other), [])
    // Odd shapes fall back to hiding.
    await f.setFields(uid, { watch: ['hideShorts'] })
    assert.equal((await f.visible(uid)).includes('feed-short'), false)
    await f.setFields(uid, 'not an object')
    assert.equal((await f.visible(uid)).includes('feed-short'), false)
  } finally {
    await f.db.close()
  }
})

test('searches that ask about Shorts decide for themselves', () => {
  assert.equal(shorts.asksForShorts('type:video is:short'), true)
  assert.equal(shorts.asksForShorts('type:video -is:short'), true)
  assert.equal(shorts.asksForShorts('is:"short"'), true)
  assert.equal(shorts.asksForShorts('type:video -is:seen'), false)
  assert.equal(shorts.asksForShorts('is:shortlisted'), false)
  assert.equal(shorts.asksForShorts(undefined), false)
})

const video = (duration, player, title = 'A video', description = '') => ({
  id: 'v',
  snippet: {
    title,
    description,
    channelId: 'c',
    channelTitle: 'C',
    publishedAt: '',
  },
  contentDetails: { duration },
  status: {},
  player,
})

test('a Short is three minutes or less and vertical or square', () => {
  const tall = { embedWidth: '1000', embedHeight: '1778' }
  const wide = { embedWidth: '1000', embedHeight: '563' }
  assert.equal(client.isShortVideo(video('PT45S', tall)), true)
  assert.equal(client.isShortVideo(video('PT3M', tall)), true)
  assert.equal(
    client.isShortVideo(
      video('PT59S', { embedWidth: 1000, embedHeight: 1000 })
    ),
    true
  )
  assert.equal(client.isShortVideo(video('PT3M1S', tall)), false)
  assert.equal(client.isShortVideo(video('PT45S', wide)), false)
  // Shape unknown: the #shorts tag decides.
  assert.equal(client.isShortVideo(video('PT45S', undefined)), false)
  assert.equal(
    client.isShortVideo(video('PT45S', undefined, 'Quick tip #Shorts')),
    true
  )
  assert.equal(
    client.isShortVideo(video('PT45S', {}, 'Quick tip', 'More #shorts')),
    true
  )
  assert.equal(
    client.isShortVideo(video('PT10M', undefined, 'Long one #shorts')),
    false
  )
  // Live streams and unknown lengths report P0D.
  assert.equal(client.isShortVideo(video('P0D', tall)), false)
})
