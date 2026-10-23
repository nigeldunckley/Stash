// Watch collections, such as Tech or Motorsport. Each one is a label: a
// channel in a collection files every video it posts there (the server
// matches `collection:<id>` against the channel), and a single video can be
// put in one by giving it the label. Which labels are collections, and their
// order, is kept with your account in the personalization settings.

import { announceMoment } from '../moments'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { gql } from 'graphql-request'
import { useCallback, useMemo } from 'react'
import { Label } from '../networking/fragments/labelFragment'
import { useGetLabels } from '../networking/labels/useLabels'
import {
  GQL_CREATE_LABEL,
  GQL_DELETE_LABEL,
  GQL_UPDATE_LABEL,
} from '../networking/labels/gql'
import {
  LibraryItemNode,
  useSetItemLabels,
} from '../networking/library_items/useLibraryItems'
import { updateSubscriptionMutation } from '../networking/mutations/updateSubscriptionMutation'
import { Subscription } from '../networking/queries/useGetSubscriptionsQuery'
import { gqlFetcher } from '../networking/networkHelpers'
import { showErrorToast } from '../toastHelpers'

export type Collection = { id: string; name: string; color: string }

// New collections take the next of these in turn.
export const COLLECTION_COLORS = [
  '#4C7BF3',
  '#E5484D',
  '#F5A524',
  '#8E4EC6',
  '#30A46C',
  '#12A594',
  '#E54D8F',
  '#8B8D98',
]

type Fields = Record<string, unknown> & { watch?: { collections?: unknown } }

const GQL_GET_FIELDS = gql`
  query WatchFields {
    getUserPersonalization {
      ... on GetUserPersonalizationSuccess {
        userPersonalization {
          fields
        }
      }
      ... on GetUserPersonalizationError {
        errorCodes
      }
    }
  }
`

const GQL_SET_FIELDS = gql`
  mutation SetWatchFields($input: SetUserPersonalizationInput!) {
    setUserPersonalization(input: $input) {
      ... on SetUserPersonalizationSuccess {
        updatedUserPersonalization {
          fields
        }
      }
      ... on SetUserPersonalizationError {
        errorCodes
      }
    }
  }
`

const readFields = async (): Promise<Fields> => {
  const data = (await gqlFetcher(GQL_GET_FIELDS)) as {
    getUserPersonalization?: { userPersonalization?: { fields?: Fields } }
  }
  const fields = data.getUserPersonalization?.userPersonalization?.fields
  return fields && typeof fields === 'object' ? fields : {}
}

type ListKey = 'collections' | 'order'

const listOf = (fields: Fields, key: ListKey): string[] => {
  const ids = (fields.watch as Record<string, unknown> | undefined)?.[key]
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
}
const idsOf = (fields: Fields) => listOf(fields, 'collections')

// Reads one of Watch's saved lists of ids: the collections, or the order of
// Watch later.
export const readWatchList = async (key: ListKey) =>
  listOf(await readFields(), key)

// Changes one of Watch's saved lists. Reads the latest copy first so other
// settings kept in the same place are left as they are.
export const updateWatchList = async (
  key: ListKey,
  change: (ids: string[]) => string[]
) => {
  const fields = await readFields()
  const ids = change(listOf(fields, key))
  const data = (await gqlFetcher(GQL_SET_FIELDS, {
    input: {
      fields: { ...fields, watch: { ...fields.watch, [key]: ids } },
    },
  })) as { setUserPersonalization?: { errorCodes?: string[] } }
  if (data.setUserPersonalization?.errorCodes?.length) {
    throw new Error(data.setUserPersonalization.errorCodes[0])
  }
  return ids
}

const updateIds = (change: (ids: string[]) => string[]) =>
  updateWatchList('collections', change)

const IDS_KEY = ['watch-collections']

export function useWatchCollections() {
  const queryClient = useQueryClient()
  const { data: labels, isPending: labelsPending } = useGetLabels()
  const { data: ids, isPending: idsPending } = useQuery({
    queryKey: IDS_KEY,
    queryFn: async () => idsOf(await readFields()),
    staleTime: 60 * 1000,
  })

  const collections = useMemo(() => {
    const byId = new Map(
      (labels ?? []).map((label: Label) => [label.id, label])
    )
    return (ids ?? [])
      .map((id) => byId.get(id))
      .filter((label): label is Label => !!label)
      .map((label) => ({ id: label.id, name: label.name, color: label.color }))
  }, [labels, ids])

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['labels'] })
    await queryClient.invalidateQueries({ queryKey: IDS_KEY })
  }, [queryClient])

  const create = useCallback(
    async (name: string, color?: string): Promise<Collection | undefined> => {
      const trimmed = name.trim()
      if (!trimmed) return undefined
      try {
        // A label with the same name is reused rather than duplicated.
        let label = (labels ?? []).find(
          (l: Label) => l.name.toLowerCase() == trimmed.toLowerCase()
        )
        if (!label) {
          const result = (await gqlFetcher(GQL_CREATE_LABEL, {
            input: {
              name: trimmed,
              color:
                color ??
                COLLECTION_COLORS[
                  collections.length % COLLECTION_COLORS.length
                ],
              description: 'Watch collection',
            },
          })) as { createLabel: { label?: Label; errorCodes?: string[] } }
          label = result.createLabel.label
          if (!label) throw new Error(result.createLabel.errorCodes?.[0])
        }
        const id = label.id
        queryClient.setQueryData<string[]>(IDS_KEY, (old) =>
          old?.includes(id) ? old : [...(old ?? []), id]
        )
        await updateIds((old) => (old.includes(id) ? old : [...old, id]))
        await refresh()
        return { id, name: label.name, color: label.color }
      } catch {
        showErrorToast('Could not make that collection')
        await refresh()
        return undefined
      }
    },
    [labels, collections.length, queryClient, refresh]
  )

  const update = useCallback(
    async (
      collection: Collection,
      change: { name?: string; color?: string }
    ) => {
      try {
        await gqlFetcher(GQL_UPDATE_LABEL, {
          input: {
            labelId: collection.id,
            name: change.name?.trim() || collection.name,
            color: change.color ?? collection.color,
            description: 'Watch collection',
          },
        })
      } catch {
        showErrorToast('Could not change that collection')
      }
      await refresh()
    },
    [refresh]
  )

  // Deleting the label also takes it off its videos and channels.
  const remove = useCallback(
    async (collection: Collection) => {
      queryClient.setQueryData<string[]>(IDS_KEY, (old) =>
        (old ?? []).filter((id) => id != collection.id)
      )
      try {
        await updateIds((old) => old.filter((id) => id != collection.id))
        await gqlFetcher(GQL_DELETE_LABEL, { id: collection.id })
      } catch {
        showErrorToast('Could not delete that collection')
      }
      await refresh()
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      await queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
    },
    [queryClient, refresh]
  )

  return {
    collections,
    ready: !labelsPending && !idsPending,
    create,
    update,
    remove,
  }
}

// Puts a channel in a collection, or takes it out with null. Its videos,
// past and future, follow it.
export function useSetChannelCollection() {
  const queryClient = useQueryClient()
  return useCallback(
    async (subscription: Subscription, collectionId: string | null) => {
      queryClient.setQueriesData<Subscription[]>(
        { queryKey: ['subscriptions'] },
        (old) =>
          Array.isArray(old)
            ? old.map((s) =>
                s.id == subscription.id ? { ...s, collectionId } : s
              )
            : old
      )
      const result = await updateSubscriptionMutation({
        id: subscription.id,
        collectionId: collectionId ?? '',
      })
      if (result.updateSubscription.errorCodes?.length) {
        showErrorToast(`Could not move ${subscription.name}`)
      }
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      await queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
    },
    [queryClient]
  )
}

// The collection a video is in: one it was put in by hand, else its
// channel's.
export function collectionOfItem(
  item: LibraryItemNode,
  collections: Collection[],
  subscriptions: Subscription[] | undefined
): Collection | undefined {
  const labelled = collections.find((c) =>
    item.labels?.some((label) => label.id == c.id)
  )
  if (labelled) return labelled
  const channel = subscriptions?.find((s) => s.url == item.subscription)
  return collections.find((c) => c.id == channel?.collectionId)
}

// Puts a single video in a collection (or none), keeping its other labels.
export function useSetVideoCollection() {
  const setLabels = useSetItemLabels()
  const queryClient = useQueryClient()
  return useCallback(
    async (
      item: LibraryItemNode,
      collection: Collection | null,
      collections: Collection[]
    ) => {
      const ids = new Set(collections.map((c) => c.id))
      const kept = (item.labels ?? []).filter((label) => !ids.has(label.id))
      const labels = collection
        ? [
            ...kept,
            {
              id: collection.id,
              name: collection.name,
              color: collection.color,
              createdAt: new Date(),
            },
          ]
        : kept
      if (collection) {
        announceMoment('collected', undefined, `collection-${collection.id}`)
      }
      try {
        await setLabels.mutateAsync({
          itemId: item.id,
          slug: item.slug,
          labels,
        })
      } catch {
        showErrorToast('Could not move that video')
      }
      await queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
    },
    [setLabels, queryClient]
  )
}
