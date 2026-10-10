import express from 'express'
import { getClaimsByToken, getTokenByRequest } from '../utils/auth'

// Which build of the API is running, for Settings > Developer. The image
// build (.github/workflows/build-stash-api.yml) bakes in the STASH_* values.
export const buildInfo = () => ({
  commit: process.env.STASH_COMMIT || undefined,
  subject: process.env.STASH_COMMIT_SUBJECT || undefined,
  body: process.env.STASH_COMMIT_BODY || undefined,
  committedAt: process.env.STASH_COMMITTED_AT || undefined,
  builtAt: process.env.STASH_BUILT_AT || undefined,
  startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
})

export function versionRouter() {
  const router = express.Router()

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  router.get('/', async (req, res) => {
    const claims = await getClaimsByToken(getTokenByRequest(req))
    if (!claims) {
      return res.status(401).send({ error: 'UNAUTHORIZED' })
    }
    res.send(buildInfo())
  })

  return router
}
