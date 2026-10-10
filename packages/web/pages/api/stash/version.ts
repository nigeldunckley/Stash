import { promises as fs } from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ssrFetcher } from '../../../lib/networking/networkHelpers'
import {
  BuildInfo,
  ServerVersion,
  UpdateNote,
} from '../../../lib/serverVersion'

type Request = NextApiRequest & { cookies: { [key: string]: string } }

// Served at /_stash/version (see next.config.js), since Caddy sends other
// /api paths to the API server.

// deploy/status, mounted by deploy/docker-compose.yml
const STATUS_DIR = process.env.STASH_STATUS_DIR || '/stash-status'

const webBuild = (): BuildInfo => ({
  commit: process.env.STASH_COMMIT || undefined,
  subject: process.env.STASH_COMMIT_SUBJECT || undefined,
  body: process.env.STASH_COMMIT_BODY || undefined,
  committedAt: process.env.STASH_COMMITTED_AT || undefined,
  builtAt: process.env.STASH_BUILT_AT || undefined,
  startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
})

const readNote = async (name: string): Promise<UpdateNote | null> => {
  try {
    const text = await fs.readFile(path.join(STATUS_DIR, name), 'utf8')
    const note = JSON.parse(text) as UpdateNote
    return note.at ? note : null
  } catch {
    return null
  }
}

const apiBuild = async (token: string): Promise<BuildInfo | null> => {
  const base = (process.env.INTERNAL_API_URL ?? '').replace(/\/$/, '')
  if (!base) {
    return null
  }
  try {
    const response = await fetch(`${base}/version`, {
      headers: { authorization: token },
      signal: AbortSignal.timeout(5000),
    })
    return response.ok ? ((await response.json()) as BuildInfo) : null
  } catch {
    return null
  }
}

export default async function handler(
  req: Request,
  res: NextApiResponse<ServerVersion | { error: string }>
): Promise<void> {
  const token =
    req.cookies['auth'] ||
    req.cookies['authToken'] ||
    req.headers['authorization']
  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED' })
    return
  }
  // Only for someone signed in to this server.
  const viewer = (await ssrFetcher({ req }, `query { me { id } }`).catch(
    () => undefined
  )) as { me?: { id: string } | null } | undefined
  if (!viewer?.me?.id) {
    res.status(401).json({ error: 'UNAUTHORIZED' })
    return
  }

  const [api, lastCheck, lastUpdate] = await Promise.all([
    apiBuild(token),
    readNote('last-check.json'),
    readNote('last-update.json'),
  ])
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ web: webBuild(), api, lastCheck, lastUpdate })
}
