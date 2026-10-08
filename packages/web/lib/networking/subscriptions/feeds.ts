import { gql } from 'graphql-request'
import { GQL_BULK_ACTION } from '../library_items/gql'
import { BulkAction } from '../library_items/useLibraryItems'
import { gqlFetcher } from '../networkHelpers'

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

// Quotes a value for use in a search filter such as subscription:"Name".
export const searchValue = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
