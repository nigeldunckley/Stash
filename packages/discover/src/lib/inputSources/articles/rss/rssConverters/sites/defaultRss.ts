import { slugify } from 'voca'
import {
  getFirstParagraphForEmbedding,
  removeHTMLTag,
  streamHeadAndRetrieveOpenGraph,
} from '../generic'
import { JSDOM } from 'jsdom'
import { OmnivoreFeed } from '../../../../../../types/Feeds'
import { OmnivoreArticle } from '../../../../../../types/OmnivoreArticle'

const getImage = (article: any): string | undefined => {
  const media = article['media:content']
  const mediaImages = (Array.isArray(media) ? media : [media]).filter(
    (entry) =>
      entry?.['@_url'] &&
      (!entry['@_medium'] || entry['@_medium'] === 'image') &&
      (!entry['@_type'] || entry['@_type'].startsWith('image/'))
  )
  mediaImages.sort(
    (a, b) =>
      Number(b['@_width'] || 0) * Number(b['@_height'] || 0) -
      Number(a['@_width'] || 0) * Number(a['@_height'] || 0)
  )
  if (mediaImages.length) return mediaImages[0]['@_url']

  const extractImageFromHtml = (document: string) => {
    const dom = new JSDOM(document)
    let best: { url: string; width: number } | undefined
    for (const image of dom.window.document.getElementsByTagName('img')) {
      const width = Number(image.getAttribute('width'))
      const height = Number(image.getAttribute('height'))
      const variants = (image.srcset || image.getAttribute('data-srcset') || '')
        .split(',')
        .map((part) => {
          const [url, descriptor] = part.trim().split(/\s+/)
          return { url, width: parseInt(descriptor, 10) || 0 }
        })
        .sort((a, b) => b.width - a.width)
      if (
        !variants[0]?.url &&
        ((width > 0 && width < 150) || (height > 0 && height < 100))
      )
        continue
      const source =
        variants[0]?.url || image.getAttribute('data-src') || image.src
      if (source) {
        try {
          const url = new URL(source, article.link)
          if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
          const sourceWidth = variants[0]?.width || width || height
          if (!best || sourceWidth > best.width) {
            best = { url: url.toString(), width: sourceWidth }
          }
        } catch {
          continue
        }
      }
    }
    return best?.url
  }

  // I've noticed some RSS feeds have some of the content encoded like this, and sometimes this contains an img tag
  if (article['content:encoded']) {
    const img = extractImageFromHtml(article['content:encoded'])
    if (img) {
      return img
    }
  }

  // Similarly, some of the descriptions are HTML based.
  if (article['description']) {
    const img = extractImageFromHtml(article['description'])
    if (img) {
      return img
    }
  }

  const thumbnail = article['media:thumbnail']
  return (Array.isArray(thumbnail) ? thumbnail[0] : thumbnail)?.['@_url']
}

const getDescription = (article: any): string | undefined => {
  // So first let's check there's some description.
  if (article['description']) {
    // Then we need to check if there's any <p> tags - If there are we enclose the entire thing in a DOM and do the extraction.
    if (/<p\b[^>]*>(.*?)<\/p>/g.test(article['description'])) {
      return getFirstParagraphForEmbedding(article['description'])
    }
    // If there aren't, then we should just use the description. It is likely correctly formatted.
    return article['description']
  }

  // Otherwise we might have the content HTML encoded in this, and we should grab it from here.
  if (article['content:encoded']) {
    return getFirstParagraphForEmbedding(article['content:encoded'])
  }

  return
}

const getDescriptionAndImage = async (article: any) => {
  let image = getImage(article)
  let description: string | undefined

  // If we do not have the image, we should try to grab the image and description from the
  // <head> of the HTML page (using OpenGraph data). We may no longer need to grab the description from the RSS feed at this point.
  if (!image) {
    const ogData = await streamHeadAndRetrieveOpenGraph(article.link)
    image = ogData.image
    description = ogData.description
  }

  if (!description) {
    description = getDescription(article)
  }

  return { image, description }
}

export const defaultRssConverter = async (
  feed: OmnivoreFeed,
  article: any
): Promise<OmnivoreArticle> => {
  const { description, image } = await getDescriptionAndImage(article)

  return {
    authors: article['dc:creator'],
    slug: `${slugify(article.link)}-${slugify(feed.id)}`,
    url: article.link,
    title: removeHTMLTag(article.title),
    description: description ?? '',
    summary: description ?? '',
    image: image ?? '',
    site: new URL(article.link).host,
    publishedAt: new Date(article.pubDate ?? article['dc:date'] ?? Date.now()),
    type: 'rss',
    feedId: feed.id,
  }
}
