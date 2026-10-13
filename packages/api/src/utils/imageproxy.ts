import crypto from 'crypto'
import { encode } from 'urlsafe-base64'
import { env } from '../env'

function signImageProxyUrl(url: string): string {
  return encode(
    crypto.createHmac('sha256', env.imageProxy.secretKey).update(url).digest()
  )
}

export function createImageProxyUrl(
  url: string,
  width = 0,
  height = 0
): string {
  if (!env.imageProxy.url || !env.imageProxy.secretKey) {
    return url
  }

  // url is already signed
  if (url.startsWith(env.imageProxy.url)) {
    return url
  }

  const urlWithOptions = `${url}#${width}x${height}`
  const signature = signImageProxyUrl(urlWithOptions)

  return `${env.imageProxy.url}/${width}x${height},s${signature}/${url}`
}

export const createThumbnailProxyUrl = (url: string): string =>
  createImageProxyUrl(url, 320, 320)

// Cards span several hundred CSS pixels on desktop. A 320px square is visibly
// soft on high-density screens, even when the source is sharp.
export const createCardImageProxyUrl = (url: string): string =>
  createImageProxyUrl(originalImageUrl(url), 640, 640)

// Returns the source image of a URL that was already run through the proxy
// (feed items used to store their thumbnail that way), so it can be signed
// again at another size.
export function originalImageUrl(url: string): string {
  if (!env.imageProxy.url || !url.startsWith(env.imageProxy.url)) {
    return url
  }
  const match = url
    .slice(env.imageProxy.url.length)
    .match(/^\/[^/]*,s[^/]+\/(https?:\/\/?.+)$/)
  if (!match) {
    return url
  }
  // Some routers collapse the double slash in the embedded URL.
  return match[1].replace(/^(https?:)\/(?!\/)/, '$1//')
}

// A large, uncropped version of an item's image for headers and cards:
// 1600px wide, height kept in proportion.
export const createHeaderImageProxyUrl = (url: string): string =>
  createImageProxyUrl(originalImageUrl(url), 1600, 0)
