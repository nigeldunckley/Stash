import UrlPattern from 'url-pattern'

export const videoIdFromYouTubeUrl = (
  urlString: string | undefined
): string | undefined => {
  if (!urlString) {
    return undefined
  }

  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return undefined
  }
  if (!/(^|\.)youtube\.com$/.test(url.hostname) && url.hostname !== 'youtu.be')
    return undefined
  const pathId = url.pathname.match(
    /^\/(?:shorts|live)\/([\w-]{11})(?:\/|$)/
  )?.[1]
  if (pathId) return pathId

  const videoId = url.searchParams.get('v')
  if (videoId) {
    return /^[\w-]{11}$/.test(videoId) ? videoId : undefined
  }

  const parsed = (() => {
    const parsedUrl = new URL(url)
    parsedUrl.search = ''
    return parsedUrl.toString()
  })()

  const shortVideo = new UrlPattern('http(s)\\://(www.)youtu.be/:videoId')
  const directVideo = new UrlPattern(
    '(http(s)\\://)(www.)youtube.com/v/:videoId'
  )
  const embedVideo = new UrlPattern(
    '(http(s)\\://)(www.)youtube.com/embed/:videoId'
  )

  let params = shortVideo.match(parsed) as Record<string, string>
  if (params && params.videoId) {
    return params.videoId
  }

  params = directVideo.match(parsed) as Record<string, string>
  if (params && params.videoId) {
    return params.videoId
  }

  params = embedVideo.match(parsed) as Record<string, string>
  if (params && params.videoId) {
    return params.videoId
  }

  return undefined
}

export const isYouTubeVideoURL = (url: string | undefined): boolean => {
  if (!url) {
    return false
  }
  const videoId = videoIdFromYouTubeUrl(url)
  return videoId != null
}

// One address per video, so a video saved from youtu.be, m.youtube.com or an
// embed link is the same item as one saved from the watch page. Shorts keep
// their /shorts/ address. Anything that isn't a video comes back unchanged.
export const canonicalYouTubeUrl = (url: string): string => {
  const videoId = videoIdFromYouTubeUrl(url)
  if (!videoId) return url
  return /\/shorts\//.test(url)
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`
}
