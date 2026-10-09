import type { NextApiRequest, NextApiResponse } from 'next'
import { v4 as uuidv4 } from 'uuid'
import { locale, timeZone } from '../../lib/dateFormatting'
import { SaveResponseData } from '../../lib/networking/mutations/saveUrlMutation'
import { ssrFetcher } from '../../lib/networking/networkHelpers'

type Request = NextApiRequest & { cookies: { [key: string]: string } }
type Response = NextApiResponse

type SaveOutcome =
  | { ok: true; url?: string; alreadySaved: boolean }
  | { ok: false; unauthorized: boolean }

// What the Save to Stash Shortcut and the Mac button read back. `message`
// is shown as-is in the Shortcut's notification.
export type SaveApiResponse = {
  saved: boolean
  alreadySaved?: boolean
  message: string
  url?: string
}

const saveUrl = async (
  req: Request,
  url: URL,
  labels: string[] | undefined,
  state: string | undefined,
  timezone?: string,
  locale?: string
): Promise<SaveOutcome> => {
  const clientRequestId = uuidv4()
  const mutation = `
    mutation SaveUrl($input: SaveUrlInput!) {
      saveUrl(input: $input) {
        ... on SaveSuccess {
          url
          clientRequestId
        }
        ... on SaveError {
          errorCodes
          message
        }
      }
    }
  `

  try {
    const data = await ssrFetcher({ req }, mutation, {
      input: {
        clientRequestId,
        url: url.toString(),
        source: 'api-save-url',
        labels: labels?.map((label) => ({ name: label })),
        state,
        timezone,
        locale,
      },
    })

    const output = data as
      | (SaveResponseData & { saveUrl?: { errorCodes?: string[] } })
      | undefined
    if (!output?.saveUrl?.clientRequestId) {
      const unauthorized =
        !!output?.saveUrl?.errorCodes?.includes('UNAUTHORIZED')
      return { ok: false, unauthorized }
    }
    return {
      ok: true,
      url: output.saveUrl.url,
      // The API keeps the existing item's id when the link is already saved,
      // so a different id from the one we sent means it was there before.
      alreadySaved: output.saveUrl.clientRequestId !== clientRequestId,
    }
  } catch (error) {
    console.log('error savingUrl', { error })
    // A revoked or mistyped key fails while the API reads the request.
    const unauthorized = /api key|jwt|unauthori[sz]ed/i.test(String(error))
    return { ok: false, unauthorized }
  }
}

const firstValue = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return firstValue(value[0])
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// Share sheets hand over a URL, a page, or text with a URL in it.
const findUrl = (value: string | undefined): URL | undefined => {
  if (!value) return undefined
  for (const part of value.split(/\s+/)) {
    try {
      const url = new URL(part)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url
    } catch {
      // not a URL, keep looking
    }
  }
  return undefined
}

const wantsJson = (req: Request): boolean =>
  req.method === 'POST' ||
  req.query['format'] === 'json' ||
  (req.headers.accept ?? '').includes('application/json')

export default async function handler(req: Request, res: Response) {
  const body = (typeof req.body === 'object' && req.body) || {}
  const urlStr =
    firstValue(req.query['url']) ??
    firstValue(body.url) ??
    firstValue(body.text) ??
    (typeof req.body === 'string' ? req.body : undefined)
  if (req.query['labels'] && typeof req.query['labels'] === 'string') {
    req.query['labels'] = [req.query['labels']]
  }
  const labels = req.query['labels'] as string[] | undefined
  const state = req.query['state'] as string | undefined
  const json = wantsJson(req)

  const reply = (status: number, payload: SaveApiResponse) => {
    res.setHeader('Cache-Control', 'no-store')
    res.status(status).json(payload)
  }

  const url = findUrl(urlStr)
  if (!url) {
    if (json) {
      return reply(400, {
        saved: false,
        message: 'Nothing to save. Share a web page or a link.',
      })
    }
    res.status(400).send('Missing url')
    return
  }

  const hasToken =
    !!req.cookies['auth'] ||
    !!req.cookies['authToken'] ||
    !!req.headers['authorization']
  const saveResult: SaveOutcome = hasToken
    ? await saveUrl(req, url, labels, state, timeZone, locale)
    : { ok: false, unauthorized: true }
  console.log('saveResult: ', saveResult)

  if (json) {
    if (saveResult.ok) {
      return reply(200, {
        saved: true,
        alreadySaved: saveResult.alreadySaved,
        message: saveResult.alreadySaved
          ? 'Already in Stash'
          : 'Saved to Stash',
        url: saveResult.url,
      })
    }
    if (saveResult.unauthorized) {
      return reply(401, {
        saved: false,
        message:
          "Stash didn't accept your save key. Make a new one in Settings, Save from Safari.",
      })
    }
    return reply(502, {
      saved: false,
      message: "Couldn't save to Stash. Try again in a moment.",
    })
  }

  if (saveResult.ok) {
    res.redirect(`/article?url=${encodeURIComponent(url.toString())}`)
    return
  }

  res.status(200).send('ok')
}
