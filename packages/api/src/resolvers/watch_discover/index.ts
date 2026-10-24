import {
  DismissWatchDiscoverVideoError,
  DismissWatchDiscoverVideoSuccess,
  MutationDismissWatchDiscoverVideoArgs,
  QueryWatchDiscoverArgs,
  WatchDiscoverError,
  WatchDiscoverErrorCode,
  WatchDiscoverSuccess,
} from '../../generated/graphql'
import {
  buildWatchDiscover,
  dismissWatchDiscoverVideo,
} from '../../services/watch_discover'
import { authorized } from '../../utils/gql-utils'

const VIDEO_ID = /^[\w-]{11}$/

export const watchDiscoverResolver = authorized<
  WatchDiscoverSuccess,
  WatchDiscoverError,
  QueryWatchDiscoverArgs
>(async (_, { refresh }, { uid, log }) => {
  try {
    return await buildWatchDiscover(uid, !!refresh)
  } catch (error) {
    log.error('watch discover failed', error)
    return { errorCodes: [WatchDiscoverErrorCode.BadRequest] }
  }
})

export const dismissWatchDiscoverVideoResolver = authorized<
  DismissWatchDiscoverVideoSuccess,
  DismissWatchDiscoverVideoError,
  MutationDismissWatchDiscoverVideoArgs
>(async (_, { input }, { uid }) => {
  if (
    !VIDEO_ID.test(input.videoId) ||
    (input.channelId && !/^UC[\w-]{22}$/.test(input.channelId))
  ) {
    return { errorCodes: [WatchDiscoverErrorCode.BadRequest] }
  }
  await dismissWatchDiscoverVideo(
    uid,
    input.videoId,
    input.channelId ?? undefined,
    !!input.restore
  )
  return { videoId: input.videoId }
})
