// Following YouTube channels from anywhere in Watch: the add box, the player
// and the Save to Stash window.

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { subscribeMutation } from '../networking/mutations/subscribeMutation'
import { SubscriptionType } from '../networking/queries/useGetSubscriptionsQuery'
import { lookupYouTubeChannel } from '../networking/subscriptions/youtube'
import { useGetSubscriptions } from '../networking/subscriptions/useGetSubscriptions'
import { showErrorToast, showSuccessToast } from '../toastHelpers'
import { isYouTubeFeedUrl } from '../youtube'

export type FollowResult = 'followed' | 'already' | 'failed'

// Subscribes to a channel's feed and tells the lists to refresh.
export function useFollowChannel() {
  const queryClient = useQueryClient()
  return useCallback(
    async (
      channel: { feedUrl: string; title: string },
      options: {
        includeShorts?: boolean
        quiet?: boolean
        collectionId?: string
      } = {}
    ): Promise<FollowResult> => {
      let result: FollowResult
      try {
        const response = await subscribeMutation({
          url: channel.feedUrl,
          subscriptionType: SubscriptionType.RSS,
          includeShorts: options.includeShorts ?? false,
          collectionId: options.collectionId,
        })
        const error = response.subscribe.errorCodes?.[0]
        result =
          error == 'ALREADY_SUBSCRIBED'
            ? 'already'
            : error
            ? 'failed'
            : 'followed'
      } catch {
        result = 'failed'
      }
      if (result == 'failed') {
        showErrorToast(`Could not follow ${channel.title}`)
        return result
      }
      if (!options.quiet) {
        showSuccessToast(
          result == 'already'
            ? `You already follow ${channel.title}`
            : `Following ${channel.title}`
        )
      }
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      await queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
      return result
    },
    [queryClient]
  )
}

const normalise = (name: string) => name.trim().toLowerCase()

// The channels already followed, by feed address and by name. Videos saved
// from a link only know their channel's name.
export function useFollowedChannels() {
  const { data, isPending } = useGetSubscriptions({})
  return useMemo(() => {
    const active = (data ?? []).filter(
      (subscription) =>
        subscription.status == 'ACTIVE' && isYouTubeFeedUrl(subscription.url)
    )
    const urls = new Set(active.map((subscription) => subscription.url))
    const names = new Set(
      active.map((subscription) => normalise(subscription.name))
    )
    return {
      ready: !isPending,
      hasFeed: (feedUrl: string) => urls.has(feedUrl),
      hasName: (name: string | undefined) =>
        !!name && names.has(normalise(name)),
    }
  }, [data, isPending])
}

// Finds the channel behind a video link and follows it.
export function useFollowVideoChannel() {
  const follow = useFollowChannel()
  return useCallback(
    async (videoUrl: string): Promise<FollowResult> => {
      try {
        const channel = await lookupYouTubeChannel(videoUrl)
        if (!channel) {
          showErrorToast('Could not find the channel for this video')
          return 'failed'
        }
        return await follow(channel)
      } catch {
        showErrorToast('Could not reach YouTube. Try again in a moment.')
        return 'failed'
      }
    },
    [follow]
  )
}
