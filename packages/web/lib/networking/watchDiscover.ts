import { useQuery, useQueryClient } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { useCallback } from 'react'
import { gqlFetcher } from './networkHelpers'

// Watch › Discover: videos you might want next, picked by Stash from what you
// watch, and channels whose videos keep turning up beside yours.

export type WatchDiscoverReasonKind =
  | 'finished'
  | 'highlighted'
  | 'saved'
  | 'watched'
  | 'channel'
  | 'many'

export type WatchDiscoverVideo = {
  videoId: string
  title: string
  url: string
  thumbnail: string
  duration?: number
  age?: string
  views?: number
  channelId?: string
  channelName?: string
  channelAvatar?: string
  subscribed: boolean
  reason: string
  reasonKind: WatchDiscoverReasonKind
  score: number
}

export type WatchDiscoverChannel = {
  channelId: string
  name: string
  avatar?: string
  feedUrl: string
  videoCount: number
  reason: string
  sampleTitles: string[]
}

export type WatchDiscover = {
  picks: WatchDiscoverVideo[]
  channels: WatchDiscoverChannel[]
  builtAt: string
  seeds: number
}

export const WATCH_DISCOVER_KEY = 'watch-discover'

const GQL_WATCH_DISCOVER = gql`
  query WatchDiscover($refresh: Boolean) {
    watchDiscover(refresh: $refresh) {
      ... on WatchDiscoverSuccess {
        picks {
          videoId
          title
          url
          thumbnail
          duration
          age
          views
          channelId
          channelName
          channelAvatar
          subscribed
          reason
          reasonKind
          score
        }
        channels {
          channelId
          name
          avatar
          feedUrl
          videoCount
          reason
          sampleTitles
        }
        builtAt
        seeds
      }
      ... on WatchDiscoverError {
        errorCodes
      }
    }
  }
`

const GQL_DISMISS = gql`
  mutation DismissWatchDiscoverVideo($input: DismissWatchDiscoverVideoInput!) {
    dismissWatchDiscoverVideo(input: $input) {
      ... on DismissWatchDiscoverVideoSuccess {
        videoId
      }
      ... on DismissWatchDiscoverVideoError {
        errorCodes
      }
    }
  }
`

const fetchWatchDiscover = async (refresh: boolean): Promise<WatchDiscover> => {
  const response = (await gqlFetcher(GQL_WATCH_DISCOVER, { refresh })) as {
    watchDiscover: WatchDiscover & { errorCodes?: string[] }
  }
  if (response.watchDiscover.errorCodes?.length) {
    throw new Error(response.watchDiscover.errorCodes[0])
  }
  return response.watchDiscover
}

export function useWatchDiscover(enabled = true) {
  return useQuery({
    queryKey: [WATCH_DISCOVER_KEY],
    queryFn: () => fetchWatchDiscover(false),
    enabled,
    // The server keeps the page for a few hours; asking again sooner only
    // picks up what you saved or turned down meanwhile.
    staleTime: 10 * 60 * 1000,
  })
}

export function useWatchDiscoverActions() {
  const queryClient = useQueryClient()

  const without = useCallback(
    (videoId: string) =>
      queryClient.setQueryData<WatchDiscover>(
        [WATCH_DISCOVER_KEY],
        (data) =>
          data && {
            ...data,
            picks: data.picks.filter((pick) => pick.videoId != videoId),
          }
      ),
    [queryClient]
  )

  const dismiss = useCallback(
    async (pick: WatchDiscoverVideo, restore = false) => {
      const previous = queryClient.getQueryData<WatchDiscover>([
        WATCH_DISCOVER_KEY,
      ])
      if (!restore) without(pick.videoId)
      const response = (await gqlFetcher(GQL_DISMISS, {
        input: {
          videoId: pick.videoId,
          channelId: pick.channelId,
          restore,
        },
      })) as { dismissWatchDiscoverVideo: { errorCodes?: string[] } }
      if (response.dismissWatchDiscoverVideo.errorCodes?.length) {
        if (previous) queryClient.setQueryData([WATCH_DISCOVER_KEY], previous)
        throw new Error(response.dismissWatchDiscoverVideo.errorCodes[0])
      }
    },
    [queryClient, without]
  )

  // Puts a pick back where it was after "Not for me" is undone.
  const putBack = useCallback(
    (pick: WatchDiscoverVideo, index: number) =>
      queryClient.setQueryData<WatchDiscover>(
        [WATCH_DISCOVER_KEY],
        (data) => {
          if (!data || data.picks.some((p) => p.videoId == pick.videoId)) {
            return data
          }
          const picks = [...data.picks]
          picks.splice(Math.min(index, picks.length), 0, pick)
          return { ...data, picks }
        }
      ),
    [queryClient]
  )

  const refresh = useCallback(async () => {
    const data = await fetchWatchDiscover(true)
    queryClient.setQueryData([WATCH_DISCOVER_KEY], data)
    return data
  }, [queryClient])

  return { dismiss, putBack, without, refresh }
}
