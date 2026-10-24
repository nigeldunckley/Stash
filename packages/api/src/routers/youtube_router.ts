import express from 'express'
import cors from 'cors'
import { createHmac, timingSafeEqual } from 'crypto'
import { DOMParser } from 'linkedom'
import { env } from '../env'
import { appDataSource } from '../data_source'
import { getClaimsByToken } from '../utils/auth'
import { corsConfig } from '../utils/corsConfig'
import {
  beginAuthorization,
  completeAuthorization,
  connectionStatus,
  disconnect,
  queueYouTube,
} from '../services/youtube/connection'
import { publicVideo, playbackFlags } from '../services/youtube/ingestion'
import { YouTubeUnavailableError } from '../services/youtube/client'

export function youtubeRouter() {
  const router = express.Router()
  router.use(cors<express.Request>(corsConfig))
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    next()
  })
  router.get('/callback', async (req, res) => {
    try {
      await completeAuthorization(
        typeof req.query.state === 'string' ? req.query.state : '',
        typeof req.query.code === 'string' ? req.query.code : undefined,
        !!req.query.error
      )
      res
        .type('html')
        .send(
          '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>YouTube connected · Stash</title><body><h1>YouTube is connected</h1><p>Return to Stash. Your subscriptions are being imported.</p><p><a href="/settings/integrations">Return to Stash settings</a></p></body></html>'
        )
    } catch {
      res
        .status(400)
        .type('html')
        .send(
          '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Connection incomplete · Stash</title><body><h1>YouTube connection incomplete</h1><p>Return to Stash and try connecting again. Check that you granted YouTube read access.</p></body></html>'
        )
    }
  })
  router.get('/push/:channelId/:token', async (req, res) => {
    const rows = (await appDataSource.query(
      'SELECT hub_token FROM omnivore.youtube_channels WHERE channel_id=$1',
      [req.params.channelId]
    )) as { hub_token: string }[]
    const mode = req.query['hub.mode'],
      challenge = req.query['hub.challenge']
    if (
      rows[0]?.hub_token !== req.params.token ||
      typeof challenge !== 'string' ||
      !['subscribe', 'unsubscribe'].includes(String(mode)) ||
      req.query['hub.topic'] !==
        `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${req.params.channelId}`
    ) {
      res.sendStatus(404)
      return
    }
    const lease = Math.min(
      Math.max(Number(req.query['hub.lease_seconds']) || 432000, 60),
      864000
    )
    await appDataSource.query(
      'UPDATE omnivore.youtube_channels SET lease_expires_at=$2 WHERE channel_id=$1',
      [
        req.params.channelId,
        mode === 'unsubscribe' ? null : new Date(Date.now() + lease * 1000),
      ]
    )
    res.type('text/plain').send(challenge)
  })
  router.post(
    '/push/:channelId/:token',
    express.raw({
      type: ['application/atom+xml', 'application/xml', 'text/xml'],
      limit: '256kb',
    }),
    async (req, res) => {
      const rows = (await appDataSource.query(
        'SELECT hub_token,hub_secret FROM omnivore.youtube_channels WHERE channel_id=$1',
        [req.params.channelId]
      )) as { hub_token: string; hub_secret: string }[]
      if (
        rows[0]?.hub_token !== req.params.token ||
        !Buffer.isBuffer(req.body)
      ) {
        res.sendStatus(404)
        return
      }
      const supplied = req.header('x-hub-signature') || ''
      if (supplied) {
        const expected = `sha1=${createHmac('sha1', rows[0].hub_secret)
          .update(req.body)
          .digest('hex')}`
        if (
          expected.length !== supplied.length ||
          !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
        ) {
          res.sendStatus(403)
          return
        }
      }
      // The secret callback URL scopes unsigned notifications. Even signed payloads
      // are hints only: the worker verifies all metadata against Google's API.
      const document = new DOMParser().parseFromString(
        req.body.toString('utf8'),
        'text/xml'
      )
      const ids = new Set<string>()
      for (const entry of Array.from(document.querySelectorAll('entry'))) {
        const videoId = entry.getElementsByTagName('yt:videoId')[0]?.textContent
        const channelId =
          entry.getElementsByTagName('yt:channelId')[0]?.textContent
        if (
          channelId === req.params.channelId &&
          videoId &&
          /^[\w-]{11}$/.test(videoId)
        )
          ids.add(videoId)
      }
      for (const id of ids)
        await queueYouTube(
          'youtube-notification',
          { channelId: req.params.channelId, videoId: id },
          `${req.params.channelId}-${id}`
        )
      res.sendStatus(204)
    }
  )
  router.use(async (req, res, next) => {
    try {
      const claims = await getClaimsByToken(
        (req.cookies?.auth as string | undefined) || req.header('authorization')
      )
      if (!claims?.uid) {
        res.sendStatus(401)
        return
      }
      res.locals.uid = claims.uid
      next()
    } catch {
      res.sendStatus(401)
    }
  })
  // JSON requests and an allowed origin protect cookie-authenticated mutations
  // from cross-site forms. Native requests authenticate explicitly in a header.
  router.use((req, res, next) => {
    if (req.method !== 'POST') {
      next()
      return
    }
    const origin = req.header('origin')
    if (!req.is('application/json')) {
      res.sendStatus(415)
      return
    }
    if (
      (origin && origin !== new URL(env.client.url).origin) ||
      (!origin && !req.header('authorization'))
    ) {
      res.sendStatus(403)
      return
    }
    next()
  })
  router.get('/status', async (_req, res) => {
    res.json(await connectionStatus(res.locals.uid as string))
  })
  router.post('/connect', async (_req, res) => {
    res.json(await beginAuthorization(res.locals.uid as string))
  })
  router.post('/sync', async (_req, res) => {
    await queueYouTube(
      'youtube-sync-user',
      { userId: res.locals.uid },
      res.locals.uid as string
    )
    res.status(202).json({ queued: true })
  })
  router.post('/disconnect', async (_req, res) => {
    await disconnect(res.locals.uid as string)
    res.json({ disconnected: true })
  })
  router.get('/video/:id', async (req, res) => {
    if (!/^[\w-]{11}$/.test(req.params.id)) {
      res.sendStatus(400)
      return
    }
    res.json(playbackFlags(await publicVideo(req.params.id)))
  })
  router.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(503).json({
        error:
          error instanceof YouTubeUnavailableError
            ? error.message
            : 'YouTube could not complete this request. Try again later.',
      })
    }
  )
  return router
}
