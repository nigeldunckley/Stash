import { parseHTML } from 'linkedom'

type MediaImage = {
  $?: {
    url?: string
    width?: string
    height?: string
    medium?: string
    type?: string
  }
}

// RSS may supply several sizes of the same picture. Keep the largest image
// so each app view can resize it without stretching a thumbnail.
export function largestMediaImage(
  entries?: readonly MediaImage[]
): string | undefined {
  return entries
    ?.filter(
      (entry) =>
        entry.$?.medium === 'image' || entry.$?.type?.startsWith('image/')
    )
    .sort(
      (a, b) =>
        Number(b.$?.width || 0) * Number(b.$?.height || 0) -
        Number(a.$?.width || 0) * Number(a.$?.height || 0)
    )[0]?.$?.url
}

export function imageFromHtml(
  html: string,
  baseUrl: string
): string | undefined {
  if (!html) return undefined
  let images: ReturnType<
    ReturnType<typeof parseHTML>['document']['querySelectorAll']
  >
  try {
    images = parseHTML(html).document.querySelectorAll('img')
  } catch {
    return undefined
  }
  let best: { url: string; size: number } | undefined
  for (const image of images) {
    const width = Number(image.getAttribute('width'))
    const height = Number(image.getAttribute('height'))

    // Lazy-loaded feeds often put a tiny placeholder in src and the real
    // picture in srcset. Prefer the largest declared candidate.
    const srcset =
      image.getAttribute('srcset') || image.getAttribute('data-srcset')
    const variants =
      srcset
        ?.split(',')
        .map((part) => {
          const [url, descriptor] = part.trim().split(/\s+/)
          const size = descriptor?.endsWith('w')
            ? Number.parseInt(descriptor, 10)
            : descriptor?.endsWith('x')
            ? Number.parseFloat(descriptor) * 1000
            : 0
          return { url, size: Number.isFinite(size) ? size : 0 }
        })
        .sort((a, b) => b.size - a.size) ?? []
    if (
      variants.length === 0 &&
      ((width > 0 && width < 150) || (height > 0 && height < 100))
    )
      continue
    const candidates = [
      ...variants.map((variant) => variant.url),
      image.getAttribute('data-src'),
      image.getAttribute('src'),
    ]
    for (const candidate of candidates) {
      if (!candidate) continue
      try {
        const url = new URL(candidate, baseUrl)
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          const size = variants[0]?.size || width || height
          if (!best || size > best.size) best = { url: url.toString(), size }
          break
        }
      } catch {
        continue
      }
    }
  }
  return best?.url
}
