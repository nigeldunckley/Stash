import { gql } from 'graphql-request'
import { gqlFetcher } from '../networkHelpers'

export type YouTubeChannelVideo = {
  id: string
  title: string
  url: string
  thumbnail: string
  publishedAt?: string
}

export type YouTubeChannel = {
  channelId: string
  feedUrl: string
  title: string
  handle?: string
  avatar?: string
  videos: YouTubeChannelVideo[]
  uploadsPerWeek?: number
}

const GQL_YOUTUBE_CHANNEL = gql`
  query YouTubeChannel($url: String!) {
    youtubeChannel(url: $url) {
      ... on YouTubeChannelSuccess {
        channel {
          channelId
          feedUrl
          title
          handle
          avatar
          uploadsPerWeek
          videos {
            id
            title
            url
            thumbnail
            publishedAt
          }
        }
      }
      ... on YouTubeChannelError {
        errorCodes
      }
    }
  }
`

// Finds the channel behind a channel link, @handle or video link, with its
// latest uploads, so it can be previewed before subscribing. Undefined means
// YouTube had no such channel.
export async function lookupYouTubeChannel(
  url: string
): Promise<YouTubeChannel | undefined> {
  const data = (await gqlFetcher(GQL_YOUTUBE_CHANNEL, { url })) as {
    youtubeChannel: { channel?: YouTubeChannel; errorCodes?: string[] }
  }
  const errors = data.youtubeChannel.errorCodes
  if (errors?.length) {
    if (errors[0] == 'NOT_FOUND') {
      return undefined
    }
    throw new Error(errors[0])
  }
  return data.youtubeChannel.channel
}

const GQL_SAVE_POSITION = gql`
  mutation SaveVideoPosition($input: SaveArticleReadingProgressInput!) {
    saveArticleReadingProgress(input: $input) {
      ... on SaveArticleReadingProgressSuccess {
        updatedArticle {
          id
        }
      }
      ... on SaveArticleReadingProgressError {
        errorCodes
      }
    }
  }
`

// Remembers how far into a video the viewer got: the second in the anchor
// index and the share watched as progress. Forced, so going back works too.
export async function saveVideoPosition(
  id: string,
  seconds: number,
  duration: number
): Promise<void> {
  const percent = duration > 0 ? (seconds / duration) * 100 : 0
  await gqlFetcher(GQL_SAVE_POSITION, {
    input: {
      id,
      force: true,
      readingProgressPercent: Math.min(100, Math.max(0, Math.round(percent))),
      readingProgressAnchorIndex: Math.max(0, Math.floor(seconds)),
    },
  })
}
