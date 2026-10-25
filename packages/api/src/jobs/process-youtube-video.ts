import axios from 'axios'
import { parseHTML } from 'linkedom'
import { LibraryItem } from '../entity/library_item'
import {
  findLibraryItemById,
  updateLibraryItem,
} from '../services/library_item'
import { publicVideo, playbackFlags } from '../services/youtube/ingestion'
import {
  configuredPublic,
  thumbnail,
  videoDuration,
} from '../services/youtube/client'
import { logger } from '../utils/logger'
import { videoIdFromYouTubeUrl } from '../utils/youtube'
import {
  videoDocument,
  videoThumbnail,
  watchUrl,
} from '../utils/youtubeChannel'
import { PageType } from '../generated/graphql'

// A title left by the save (the link itself, or YouTube's cookie consent
// page) or by expired metadata.
const placeholderTitle = (title: string, url: string) =>
  !title.trim() ||
  title === 'YouTube video' ||
  title === url ||
  /^https?:\/\//.test(title) ||
  /^before you continue/i.test(title)

type PublicDetails = {
  title: string
  channel: string
  channelUrl: string
  // Seconds, when the source gives it.
  length?: number
}

const oembedDetails = async (id: string): Promise<PublicDetails> => {
  const { data } = await axios.get<{
    title: string
    author_name: string
    author_url: string
  }>('https://www.youtube.com/oembed', {
    params: { format: 'json', url: watchUrl(id) },
    timeout: 10000,
  })
  return {
    title: data.title,
    channel: data.author_name,
    channelUrl: data.author_url,
  }
}

// The watch page's player data, with the cookie that skips the consent page
// YouTube shows UK visitors.
const pageDetails = async (id: string): Promise<PublicDetails> => {
  const { data } = await axios.get<string>(watchUrl(id), {
    headers: {
      Cookie: 'SOCS=CAI; CONSENT=YES+',
      'Accept-Language': 'en-GB,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    },
    responseType: 'text',
    timeout: 15000,
  })
  const field = (name: string) => {
    const match = data.match(
      new RegExp(`"videoDetails":\\{[^]*?"${name}":"((?:[^"\\\\]|\\\\.)*)"`)
    )
    return match ? (JSON.parse(`"${match[1]}"`) as string) : undefined
  }
  const title = field('title')
  const channel = field('author')
  if (!title || !channel) throw new Error('no video details on the page')
  const channelId = field('channelId')
  const length = Number(field('lengthSeconds'))
  return {
    title,
    channel,
    channelUrl: channelId
      ? `https://www.youtube.com/channel/${channelId}`
      : watchUrl(id),
    length: length > 0 ? length : undefined,
  }
}

// Without the YouTube Data API (no key, quota used up, or an error), the
// title and channel still come from oEmbed, or from the watch page.
const fillWithoutApi = async (
  item: LibraryItem,
  id: string,
  userId: string
) => {
  // Marked as looked up either way, so the maintenance job doesn't keep
  // queueing a video nothing can describe. Expired details are looked up
  // again after 30 days.
  const checked = { youtubeMetadataAt: new Date() }
  if (!placeholderTitle(item.title, item.originalUrl) && item.author) {
    return updateLibraryItem(item.id, checked, userId)
  }
  let details: PublicDetails | undefined
  for (const source of [oembedDetails, pageDetails]) {
    try {
      details = await source(id)
      break
    } catch (error) {
      logger.info(`youtube: ${source.name} unavailable`, {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (!details) {
    return updateLibraryItem(item.id, checked, userId)
  }
  await updateLibraryItem(
    item.id,
    {
      ...checked,
      title: details.title,
      author: details.channel,
      siteName: 'YouTube',
      thumbnail: item.thumbnail || videoThumbnail(id),
      ...(details.length && { wordCount: Math.round(details.length * 3.92) }),
      readableContent: videoDocument({
        videoId: id,
        title: details.title,
        channel: details.channel,
        channelUrl: details.channelUrl,
      }),
    },
    userId
  )
}
export interface ProcessYouTubeVideoJobData {
  userId: string
  libraryItemId: string
}
export interface ProcessYouTubeTranscriptJobData
  extends ProcessYouTubeVideoJobData {
  videoId: string
}
export const PROCESS_YOUTUBE_VIDEO_JOB_NAME = 'process-youtube-video'
export const PROCESS_YOUTUBE_TRANSCRIPT_JOB_NAME = 'process-youtube-transcript'
interface ChapterProperties {
  title: string
  start: number
}
interface TranscriptProperties {
  text: string
  start: number
  duration: number
}
export const addTranscriptChapters = (
  chapters: ChapterProperties[],
  transcript: TranscriptProperties[]
): TranscriptProperties[] => {
  chapters.sort((a, b) => a.start - b.start)

  for (const chapter of chapters) {
    const startOffset = chapter.start
    const title = '\n\n## ' + chapter.title + '\n\n'

    const index = transcript.findIndex(
      (textItem) => textItem.start > startOffset
    )

    if (index !== -1) {
      transcript.splice(index, 0, {
        text: title,
        duration: 1,
        start: startOffset,
      })
    } else {
      transcript.push({ text: title, duration: 0, start: startOffset })
    }
  }
  return transcript
}

export const processYouTubeVideo = async (job: ProcessYouTubeVideoJobData) => {
  const item = await findLibraryItemById(job.libraryItemId, job.userId)
  const id = item && videoIdFromYouTubeUrl(item.originalUrl)
  if (!item || !id) return
  // Belongs in Watch, even if the saved page didn't look like a video.
  if (item.itemType !== PageType.Video) {
    await updateLibraryItem(item.id, { itemType: PageType.Video }, job.userId)
  }
  if (!configuredPublic()) {
    return fillWithoutApi(item, id, job.userId)
  }
  let v: Awaited<ReturnType<typeof publicVideo>>
  try {
    v = await publicVideo(id)
  } catch (error) {
    logger.info('youtube: Data API unavailable for a saved video', {
      id,
      error: error instanceof Error ? error.message : String(error),
    })
    return fillWithoutApi(item, id, job.userId)
  }
  await updateLibraryItem(
    item.id,
    {
      ...playbackFlags(v),
      ...(v
        ? {
            ...(placeholderTitle(item.title, item.originalUrl) && {
              title: v.snippet.title,
            }),
            ...(!item.author && { author: v.snippet.channelTitle }),
            siteName: 'YouTube',
            description: v.snippet.description || '',
            wordCount: Math.round(videoDuration(v) * 3.92),
            publishedAt: new Date(v.snippet.publishedAt),
            thumbnail: thumbnail(v.snippet.thumbnails),
            readableContent: videoDocument({
              videoId: id,
              title: v.snippet.title,
              channel: v.snippet.channelTitle,
              channelUrl: `https://www.youtube.com/channel/${v.snippet.channelId}`,
              description: v.snippet.description,
            }),
          }
        : {
            title: 'Unavailable YouTube video',
            author: null,
            description: null,
            thumbnail: null,
            wordCount: 0,
            readableContent: `<p><a href="https://www.youtube.com/watch?v=${id}">Open on YouTube</a></p>`,
          }),
    },
    job.userId
  )
}
// Drain legacy transcript jobs without requesting unsupported public captions.
export const processYouTubeTranscript = async (
  _job: ProcessYouTubeTranscriptJobData
) => undefined
// Compatibility helper used by existing job tests; no automatic extraction calls it.
export const addTranscriptToReadableContent = async (
  _url: string,
  html: string,
  transcript: string
) => {
  const { document } = parseHTML(html)
  const node = document.querySelector(
    '#_omnivore_youtube_transcript, ._omnivore_youtube_transcript'
  )
  if (node) node.innerHTML = transcript
  return document.toString()
}
