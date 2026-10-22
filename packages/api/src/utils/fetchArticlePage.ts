import axios from 'axios'
import dns from 'dns'
import http from 'http'
import https from 'https'
import * as privateIpLib from 'private-ip'
import { generateFingerprint } from './helpers'
import { logger } from './logger'

// Links come from feeds and from whatever people save, so article pages are
// only fetched from public addresses: every connection, redirects included,
// resolves its host here first.
const publicLookup = ((
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number
  ) => void
) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      return callback(error, [])
    }
    if (addresses.some((a) => privateIpLib.default(a.address))) {
      return callback(new Error(`private address for ${hostname}`), [])
    }
    if (options.all) {
      return callback(null, addresses)
    }
    callback(null, addresses[0].address, addresses[0].family)
  })
}) as unknown as typeof dns.lookup
// Hosts written as an address skip the lookup, so they're checked directly.
const isPrivateHost = (hostname: string) =>
  !!privateIpLib.default(hostname.replace(/^\[|\]$/g, ''))
const publicHttpAgent = new http.Agent({ lookup: publicLookup })
const publicHttpsAgent = new https.Agent({ lookup: publicLookup })

// The article's page, when it can be read without a browser.
export const fetchArticlePage = async (url: string) => {
  try {
    if (isPrivateHost(new URL(url).hostname)) {
      return undefined
    }
    const fingerprint = generateFingerprint()
    const response = await axios.get<string>(url, {
      headers: {
        'user-agent': fingerprint.headers['user-agent'],
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
      },
      responseType: 'text',
      timeout: 20_000,
      maxRedirects: 10,
      maxContentLength: 10 * 1024 * 1024,
      httpAgent: publicHttpAgent,
      httpsAgent: publicHttpsAgent,
      proxy: false,
      beforeRedirect: (options: { hostname?: string }) => {
        if (options.hostname && isPrivateHost(options.hostname)) {
          throw new Error(`redirect to a private address: ${options.hostname}`)
        }
      },
    })
    const contentType = String(response.headers['content-type'] || '')
    if (!contentType.includes('html') || typeof response.data != 'string') {
      return undefined
    }
    return response.data
  } catch (error) {
    logger.info('page could not be read directly', {
      url,
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}
