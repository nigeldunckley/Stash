import { parseHTML } from 'linkedom'
import {
  findLibraryItemById,
  updateLibraryItem,
} from '../services/library_item'
import { publicVideo, playbackFlags } from '../services/youtube/ingestion'
import { thumbnail, videoDuration } from '../services/youtube/client'
import { videoIdFromYouTubeUrl } from '../utils/youtube'
import { videoDocument } from '../utils/youtubeChannel'
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
  const v = await publicVideo(id)
  await updateLibraryItem(
    item.id,
    {
      ...playbackFlags(v),
      ...(v
        ? {
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
