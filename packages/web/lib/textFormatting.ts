import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export const timeAgo = (date: string | undefined): string => {
  if (!date) {
    return ''
  }
  return dayjs(date).fromNow()
}

// A compact age for list rows: "Just now", "5 mins ago", "3 hrs ago",
// "2 days ago", then the date once it is over a week old.
export const shortTimeAgo = (
  date: string | undefined,
  now = Date.now()
): string => {
  if (!date) {
    return ''
  }
  const then = dayjs(date)
  if (!then.isValid()) {
    return ''
  }
  const minutes = Math.floor((now - then.valueOf()) / 60000)
  // Abbreviated units don't take a plural: 8 min ago, 3 hr ago.
  if (minutes < 1) {
    return 'Just now'
  }
  if (minutes < 60) {
    return `${minutes} min ago`
  }
  if (minutes < 24 * 60) {
    return `${Math.floor(minutes / 60)} hr ago`
  }
  const days = Math.floor(minutes / (24 * 60))
  if (days == 1) {
    return 'Yesterday'
  }
  if (days < 7) {
    return `${days} days ago`
  }
  return then.format(then.year() == dayjs(now).year() ? 'D MMM' : 'D MMM YYYY')
}

// shortTimeAgo for the middle of a sentence: "Saved just now", "Saved
// yesterday", "Saved 3 Oct".
export const timeAgoInSentence = (
  date: string | undefined,
  now = Date.now()
): string => {
  const ago = shortTimeAgo(date, now)
  return ago == 'Just now' || ago == 'Yesterday' ? ago.toLowerCase() : ago
}

// The site's own favicon, guessed from a page or feed address.
export const faviconFor = (
  ...urls: (string | undefined | null)[]
): string | undefined => {
  for (const url of urls) {
    try {
      if (url) {
        // Feeds often live on a feeds. or rss. subdomain of the site.
        const host = new URL(url).hostname.replace(/^(feeds?|rss)\./, '')
        return `https://${host}/favicon.ico`
      }
    } catch {
      // Not a URL; try the next one.
    }
  }
  return undefined
}

export const shouldHideUrl = (url: string): boolean => {
  try {
    const origin = new URL(url).origin
    const hideHosts = [
      'https://storage.googleapis.com',
      'https://omnivore.work',
    ]
    if (hideHosts.indexOf(origin) != -1) {
      return true
    }
  } catch {
    console.log('invalid url item', url)
  }
  return false
}

const shouldHideSiteName = (siteName: string) => {
  const hideNames = ['storage.googleapis.com', 'omnivore.work']
  if (hideNames.indexOf(siteName) != -1) {
    return true
  }
  return false
}

export const siteName = (
  originalArticleUrl: string,
  itemUrl: string,
  siteName?: string
): string => {
  if (siteName) {
    return shouldHideSiteName(siteName) ? '' : siteName
  }
  if (shouldHideUrl(originalArticleUrl)) {
    return ''
  }
  try {
    return new URL(originalArticleUrl).hostname.replace(/^www\./, '')
  } catch {}
  try {
    return new URL(itemUrl).hostname.replace(/^www\./, '')
  } catch {}
  return ''
}
