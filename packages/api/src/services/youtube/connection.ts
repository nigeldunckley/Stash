import { randomBytes } from 'crypto'
import { google } from 'googleapis'
import { Credentials } from 'google-auth-library'
import { env } from '../../env'
import { redisDataSource } from '../../redis_data_source'
import { authTrx } from '../../repository'
import {
  channels,
  ChannelResource,
  configuredPublic,
  thumbnail,
  youtubeList,
  YouTubeUnavailableError,
} from './client'
import {
  credentialKey,
  decryptCredentials,
  encryptCredentials,
} from './security'

export type Connection = {
  user_id: string
  channel_id: string
  channel_title: string
  credentials: string
  generation: string
  synced_at: Date | null
  error: string | null
}
export async function userQuery<T = Record<string, unknown>>(
  uid: string,
  sql: string,
  args: unknown[] = []
): Promise<T[]> {
  return authTrx((tx) => tx.query(sql, args) as Promise<T[]>, { uid })
}
export const callbackUrl = () =>
  `${(process.env.YOUTUBE_PUBLIC_URL || env.client.url).replace(
    /\/$/,
    ''
  )}/api/youtube/callback`
export const oauthClient = () =>
  new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    callbackUrl()
  )
export function configuredConnection() {
  try {
    credentialKey()
    return (
      configuredPublic() &&
      !!process.env.YOUTUBE_CLIENT_ID &&
      !!process.env.YOUTUBE_CLIENT_SECRET
    )
  } catch {
    return false
  }
}
export async function getConnection(uid: string) {
  return (
    await userQuery<Connection>(
      uid,
      'SELECT * FROM omnivore.youtube_connections WHERE user_id=$1',
      [uid]
    )
  )[0]
}
export async function connectionStatus(uid: string) {
  const c = await getConnection(uid)
  const rows = await userQuery<{ count: string }>(
    uid,
    "SELECT count(*) FROM omnivore.subscriptions WHERE user_id=$1 AND youtube_imported=true AND youtube_excluded=false AND status='ACTIVE'",
    [uid]
  )
  const pending = await redisDataSource.redisClient?.get(
    `youtube:attempt:${uid}`
  )
  return {
    configured: configuredConnection(),
    connected: !!c?.credentials,
    channelId: c?.channel_id,
    channelTitle: c?.channel_title,
    lastSyncedAt: c?.synced_at?.toISOString(),
    error: c?.error,
    importedChannels: Number(rows[0]?.count || 0),
    authorizing: !!pending,
    syncing: !!(await redisDataSource.redisClient?.exists(
      `youtube:sync-lock:${uid}`
    )),
  }
}
export async function beginAuthorization(uid: string) {
  if (!configuredConnection())
    throw new YouTubeUnavailableError(
      'YouTube is not configured on this Stash server.'
    )
  const redis = redisDataSource.redisClient
  if (!redis) throw new Error('YouTube connection needs Redis.')
  const state = randomBytes(32).toString('hex')
  const previous = await redis.get(`youtube:attempt:${uid}`)
  if (previous) await redis.del(`youtube:state:${previous}`)
  await redis.set(`youtube:state:${state}`, uid, 'EX', 600)
  await redis.set(`youtube:attempt:${uid}`, state, 'EX', 600)
  const authorizationUrl = oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: ['https://www.googleapis.com/auth/youtube.readonly'],
    state,
  })
  return { authorizationUrl }
}
export async function completeAuthorization(
  state: string,
  code?: string,
  denied = false
) {
  const redis = redisDataSource.redisClient
  const uid = await redis?.getdel(`youtube:state:${state}`)
  if (!uid)
    throw new Error(
      'This connection attempt expired. Return to Stash and try again.'
    )
  if ((await redis?.get(`youtube:attempt:${uid}`)) !== state)
    throw new Error(
      'This connection attempt was replaced. Return to Stash and try again.'
    )
  // Keep the attempt marker until persistence completes, so status never races completion.
  try {
    if (denied || !code)
      throw new Error(
        'YouTube connection cancelled. You can try again in Stash.'
      )
    const auth = oauthClient()
    const { tokens } = await auth.getToken(code)
    if (!tokens.refresh_token || !tokens.access_token)
      throw new Error(
        'Google did not grant background access. Reconnect and approve YouTube access.'
      )
    if (
      !tokens.scope
        ?.split(' ')
        .includes('https://www.googleapis.com/auth/youtube.readonly')
    )
      throw new Error('YouTube read access was not granted.')
    const identity = (
      await youtubeList<ChannelResource>(
        'channels',
        { mine: true, part: 'snippet', maxResults: 50 },
        tokens.access_token
      )
    ).items
    if (identity.length !== 1)
      throw new Error(
        'Choose a single YouTube channel when connecting your Google account.'
      )
    const c = identity[0]
    const existing = await getConnection(uid)
    if (existing?.credentials && existing.channel_id !== c.id)
      throw new Error(
        'Disconnect the existing YouTube channel in Stash before connecting another.'
      )
    await authTrx(
      async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          uid,
        ])
        if ((await redis?.get(`youtube:attempt:${uid}`)) !== state)
          throw new Error('This authorization attempt was cancelled.')
        await tx.query(
          `INSERT INTO omnivore.youtube_connections(user_id,channel_id,channel_title,credentials) VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id) DO UPDATE SET credentials=excluded.credentials, channel_id=excluded.channel_id, channel_title=excluded.channel_title, generation=uuid_generate_v4(), error=NULL, synced_at=NULL`,
          [uid, c.id, c.snippet.title, encryptCredentials(tokens, uid)]
        )
      },
      { uid }
    )
    try {
      await queueYouTube('youtube-sync-user', { userId: uid })
    } catch {
      await userQuery(
        uid,
        'UPDATE omnivore.youtube_connections SET error=$2 WHERE user_id=$1',
        [uid, 'Connected. Background sync is waiting for the queue to recover.']
      )
    }
  } finally {
    await redis?.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      `youtube:attempt:${uid}`,
      state
    )
  }
}
export async function queueYouTube(
  name: string,
  data: Record<string, unknown>,
  suffix?: string
) {
  const { getQueue } = await import('../../queue-processor')
  const queue = await getQueue()
  if (!queue)
    throw new YouTubeUnavailableError(
      'The background queue is unavailable. Try again later.'
    )
  await queue.add(name, data, {
    jobId: suffix ? `${name}-${suffix}` : undefined,
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: true,
    removeOnFail: true,
  })
}
async function accessToken(c: Connection) {
  const auth = oauthClient()
  auth.setCredentials(decryptCredentials<Credentials>(c.credentials, c.user_id))
  try {
    const result = await auth.getAccessToken()
    if (!result.token) throw new Error('No access token')
    await userQuery(
      c.user_id,
      'UPDATE omnivore.youtube_connections SET credentials=$3 WHERE user_id=$1 AND generation=$2',
      [c.user_id, c.generation, encryptCredentials(auth.credentials, c.user_id)]
    )
    return result.token
  } catch (error) {
    const code = (error as { response?: { data?: { error?: string } } })
      .response?.data?.error
    if (code === 'invalid_grant' || code === 'invalid_token') {
      await clearConnection(
        c.user_id,
        c.generation,
        'YouTube access expired or was revoked. Connect again to resume sync.'
      )
      throw new YouTubeUnavailableError('YOUTUBE_RECONNECT')
    }
    throw new YouTubeUnavailableError(
      'Google could not refresh access. Sync will retry later.'
    )
  }
}
// Remove private account-derived relationships; manual follows and saved videos
// have independent provenance. Public metadata is fetched using the server API key.
async function clearConnection(
  uid: string,
  generation?: string,
  error?: string
) {
  await authTrx(
    async (tx) => {
      const rows = (await tx.query(
        'SELECT generation FROM omnivore.youtube_connections WHERE user_id=$1 FOR UPDATE',
        [uid]
      )) as { generation: string }[]
      if (!rows[0] || (generation && rows[0].generation !== generation)) return
      await tx.query(
        `UPDATE omnivore.subscriptions SET status=CASE WHEN youtube_manual_follow THEN status ELSE 'UNSUBSCRIBED'::subscription_status_type END, youtube_imported=false WHERE user_id=$1 AND youtube_imported`,
        [uid]
      )
      // Delete imported-only source/exclusion rows after removing the account link.
      // Their library items use public canonical feed URLs and remain intact.
      await tx.query(
        `DELETE FROM omnivore.subscriptions WHERE user_id=$1 AND youtube_channel_id IS NOT NULL AND NOT youtube_manual_follow`,
        [uid]
      )
      if (error)
        await tx.query(
          "UPDATE omnivore.youtube_connections SET credentials='', channel_id='', channel_title='', error=$2, generation=uuid_generate_v4() WHERE user_id=$1",
          [uid, error]
        )
      else
        await tx.query(
          'DELETE FROM omnivore.youtube_connections WHERE user_id=$1',
          [uid]
        )
    },
    { uid }
  )
}
export async function disconnect(uid: string) {
  const redis = redisDataSource.redisClient
  const c = await authTrx(
    async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        uid,
      ])
      const attempt = await redis?.getdel(`youtube:attempt:${uid}`)
      if (attempt) await redis?.del(`youtube:state:${attempt}`)
      const rows = (await tx.query(
        'SELECT * FROM omnivore.youtube_connections WHERE user_id=$1 FOR UPDATE',
        [uid]
      )) as Connection[]
      return rows[0]
    },
    { uid }
  )
  if (!c) return
  // Revoke before dropping the encrypted token. If Google is unavailable keep it
  // for a retry rather than silently claiming revocation succeeded.
  if (c.credentials) {
    const credentials = decryptCredentials<Credentials>(c.credentials, uid)
    try {
      await oauthClient().revokeToken(
        credentials.refresh_token || credentials.access_token || ''
      )
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response
        ?.status
      if (status !== 400 && status !== 401)
        throw new YouTubeUnavailableError(
          'Google could not disconnect. Try again shortly.'
        )
    }
  }
  await clearConnection(uid, c.generation)
}

export async function syncSubscriptions(uid: string) {
  const redis = redisDataSource.redisClient
  const lock = randomBytes(16).toString('hex')
  if (
    !redis ||
    !(await redis.set(`youtube:sync-lock:${uid}`, lock, 'EX', 900, 'NX'))
  )
    return
  const c = await getConnection(uid)
  try {
    if (!c?.credentials) return
    const token = await accessToken(c)
    const ids = new Set<string>()
    let pageToken: string | undefined
    const visited = new Set<string>()
    do {
      if (pageToken && visited.has(pageToken))
        throw new Error('Repeated YouTube page token')
      if (pageToken) visited.add(pageToken)
      const page = await youtubeList<{
        snippet: { resourceId: { channelId: string } }
      }>(
        'subscriptions',
        { part: 'snippet', mine: true, maxResults: 50, pageToken },
        token
      )
      page.items.forEach((item) => ids.add(item.snippet.resourceId.channelId))
      pageToken = page.nextPageToken
      if ((await redis.get(`youtube:sync-lock:${uid}`)) !== lock)
        throw new Error('Sync lease expired')
    } while (pageToken)
    const publicChannels = await channels([...ids])
    // No writes until ALL pages and public channel lookups have succeeded.
    await authTrx(
      async (tx) => {
        const current = (await tx.query(
          'SELECT generation FROM omnivore.youtube_connections WHERE user_id=$1 FOR UPDATE',
          [uid]
        )) as { generation: string }[]
        if (
          current[0]?.generation !== c.generation ||
          (await redis.get(`youtube:sync-lock:${uid}`)) !== lock
        )
          return
        for (const channel of publicChannels) {
          await tx.query(
            `INSERT INTO omnivore.subscriptions(user_id,name,url,type,status,youtube_channel_id,youtube_manual_follow,youtube_imported,folder,icon)
          VALUES($1,$2,$3,'RSS','ACTIVE',$4,false,true,'following',$5)
          ON CONFLICT(user_id,url) DO UPDATE SET youtube_channel_id=$4, youtube_imported=true, icon=excluded.icon,
          name=CASE WHEN omnivore.subscriptions.youtube_manual_follow OR omnivore.subscriptions.youtube_excluded THEN omnivore.subscriptions.name ELSE excluded.name END,
          status=CASE WHEN omnivore.subscriptions.youtube_excluded THEN omnivore.subscriptions.status ELSE 'ACTIVE'::subscription_status_type END`,
            [
              uid,
              channel.snippet.title,
              `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`,
              channel.id,
              thumbnail(channel.snippet.thumbnails) || null,
            ]
          )
          await tx.query(
            `INSERT INTO omnivore.youtube_channels(channel_id,data) VALUES($1,$2) ON CONFLICT(channel_id) DO UPDATE SET data=excluded.data,fetched_at=now()`,
            [channel.id, JSON.stringify(channel)]
          )
        }
        await tx.query(
          `UPDATE omnivore.subscriptions SET youtube_imported=false, status=CASE WHEN youtube_manual_follow THEN status ELSE 'UNSUBSCRIBED'::subscription_status_type END
        WHERE user_id=$1 AND youtube_imported AND NOT(youtube_channel_id=ANY($2::text[]))`,
          [uid, [...ids]]
        )
        await tx.query(
          'UPDATE omnivore.youtube_connections SET synced_at=now(),error=NULL WHERE user_id=$1 AND generation=$2',
          [uid, c.generation]
        )
      },
      { uid }
    )
    for (const channel of publicChannels)
      await queueYouTube(
        'youtube-refresh-channel',
        { channelId: channel.id },
        channel.id
      )
  } catch (error) {
    if (
      c &&
      error instanceof YouTubeUnavailableError &&
      error.message === 'YOUTUBE_RECONNECT'
    )
      await clearConnection(
        uid,
        c.generation,
        'YouTube access expired or was revoked. Connect again to resume sync.'
      )
    if (c) {
      const message =
        error instanceof YouTubeUnavailableError
          ? error.message
          : 'YouTube sync could not finish. It will retry automatically.'
      await userQuery(
        uid,
        'UPDATE omnivore.youtube_connections SET error=$3 WHERE user_id=$1 AND generation=$2',
        [uid, c.generation, message]
      )
    }
    throw new YouTubeUnavailableError(
      error instanceof YouTubeUnavailableError
        ? error.message
        : 'YouTube sync could not finish.'
    )
  } finally {
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      `youtube:sync-lock:${uid}`,
      lock
    )
  }
}
