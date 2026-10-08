import { gql } from 'graphql-request'
import { GQL_BULK_ACTION, GQL_MOVE_ITEM_TO_FOLDER } from '../library_items/gql'
import { BulkAction } from '../library_items/useLibraryItems'
import { gqlFetcher } from '../networkHelpers'
import {
  Subscription,
  SubscriptionType,
} from '../queries/useGetSubscriptionsQuery'

export type ScannedFeed = {
  url: string
  title: string
  type?: string
}

type ScanFeedsData = {
  scanFeeds: {
    feeds?: ScannedFeed[]
    errorCodes?: string[]
  }
}

const GQL_SCAN_FEEDS = gql`
  query ScanFeeds($input: ScanFeedsInput!) {
    scanFeeds(input: $input) {
      ... on ScanFeedsSuccess {
        feeds {
          url
          title
          type
        }
      }
      ... on ScanFeedsError {
        errorCodes
      }
    }
  }
`

// Finds the feeds behind a site address, or lists the feeds in an OPML file.
export async function scanFeeds(input: {
  url?: string
  opml?: string
}): Promise<ScannedFeed[]> {
  const data = (await gqlFetcher(GQL_SCAN_FEEDS, { input })) as ScanFeedsData
  if (data.scanFeeds.errorCodes?.length) {
    throw new Error(data.scanFeeds.errorCodes[0])
  }
  return data.scanFeeds.feeds ?? []
}

// Marks feed items as seen without refetching the open list, so rows don't
// disappear while they are being read.
export async function markItemsSeen(ids: string[]): Promise<boolean> {
  if (!ids.length) {
    return true
  }
  const data = (await gqlFetcher(GQL_BULK_ACTION, {
    action: BulkAction.MARK_AS_SEEN,
    query: `in:following use:folders includes:${ids.join(',')}`,
    expectedCount: ids.length,
  })) as { bulkAction: { success?: boolean; errorCodes?: string[] } }
  return !!data.bulkAction?.success
}

// Moves one item between Feeds ('following') and the Library ('inbox')
// without refetching the open feed list, which keeps its own state.
export async function moveItemToFolder(
  id: string,
  folder: 'inbox' | 'following'
): Promise<void> {
  const data = (await gqlFetcher(GQL_MOVE_ITEM_TO_FOLDER, { id, folder })) as {
    moveToFolder: { success?: boolean; errorCodes?: string[] }
  }
  if (data.moveToFolder.errorCodes?.length) {
    throw new Error(data.moveToFolder.errorCodes[0])
  }
}

// Quotes a value for use in a search filter such as subscription:"Name".
export const searchValue = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

// Feed items record their feed by its address and newsletter items by the
// newsletter's name, so that is what a search by subscription must match.
export const subscriptionKey = (subscription: Subscription) =>
  subscription.type == SubscriptionType.RSS && subscription.url
    ? subscription.url
    : subscription.name

// The name to show for an item's subscription, which may be a feed address.
export const subscriptionName = (
  value: string | undefined,
  subscriptions: Subscription[] | undefined
): string | undefined => {
  if (!value) {
    return undefined
  }
  const match = subscriptions?.find(
    (subscription) => subscription.url == value || subscription.name == value
  )
  if (match) {
    return match.name
  }
  return /^https?:\/\//i.test(value) ? undefined : value
}
