import { useRouter } from 'next/router'
import type { NavigationSection } from '../NavigationLayout'
import { useGetLibraryItems } from '../../../lib/networking/library_items/useLibraryItems'
import {
  useFeedSuggestions,
  useFeedSuggestionsEnabled,
} from '../../../lib/networking/feedSuggestions'
import { useWatchCollections } from '../../../lib/watch/collections'

// Stash's navigation groups pages by what you're doing: Read for anything
// with words, Watch for anything with a play button. The Mac sidebar and the
// iPhone top bar both draw from this list. Listen joins as a third group
// once it exists.
export type NavGroupId = 'read' | 'watch'

export type NavCountSource =
  | { kind: 'items'; folder: string; query: string; accent?: boolean }
  | { kind: 'discover' }

export type NavPage = {
  key: string
  label: string
  section: NavigationSection
  href: string
  selected: boolean
  count?: NavCountSource
  // A Watch collection shows its colour instead of an icon.
  color?: string
}

export type NavGroup = {
  id: NavGroupId
  label: string
  // The group's label opens its first page.
  href: string
  selected: boolean
  pages: NavPage[]
}

export const READ_SECTIONS: NavigationSection[] = [
  'subscriptions',
  'library',
  'highlights',
  'discover',
]

export function groupFor(section: NavigationSection): NavGroupId | undefined {
  if (READ_SECTIONS.includes(section)) return 'read'
  if (section == 'watch') return 'watch'
  return undefined
}

export function useNavGroups(section: NavigationSection): NavGroup[] {
  const router = useRouter()
  // Discover is hidden while suggestions are turned off in Settings.
  const suggesting = useFeedSuggestionsEnabled()
  const { collections } = useWatchCollections()
  const collectionId =
    typeof router.query.collection == 'string'
      ? router.query.collection
      : undefined
  const watchSaved = router.query.view == 'saved'
  const watching = section == 'watch'
  const group = groupFor(section)

  const read: NavPage[] = [
    {
      key: 'feeds',
      label: 'Feeds',
      section: 'subscriptions',
      href: '/l/subscriptions',
      selected: section == 'subscriptions',
      count: {
        kind: 'items',
        folder: 'following',
        query: '-is:seen -type:video',
      },
    },
    {
      key: 'saved',
      label: 'Saved',
      section: 'library',
      href: '/l/library',
      selected: section == 'library',
      count: { kind: 'items', folder: 'inbox', query: 'is:unread -type:video' },
    },
    {
      key: 'highlights',
      label: 'Highlights',
      section: 'highlights',
      href: '/l/highlights',
      selected: section == 'highlights',
    },
  ]
  if (suggesting) {
    read.push({
      key: 'discover',
      label: 'Discover',
      section: 'discover',
      href: '/l/discover',
      selected: section == 'discover',
      count: { kind: 'discover' },
    })
  }

  const watch: NavPage[] = [
    {
      key: 'channels',
      label: 'Channels',
      section: 'watch',
      href: '/l/watch',
      selected: watching && !collectionId && !watchSaved,
      count: {
        kind: 'items',
        folder: 'following',
        query: 'type:video -is:seen',
        accent: true,
      },
    },
    {
      key: 'saved',
      label: 'Saved',
      section: 'watch',
      href: '/l/watch?view=saved',
      selected: watching && !collectionId && watchSaved,
    },
    ...collections.map((collection) => ({
      key: `collection-${collection.id}`,
      label: collection.name,
      section: 'watch' as NavigationSection,
      href: `/l/watch?collection=${collection.id}`,
      selected: watching && collectionId == collection.id,
      color: collection.color,
    })),
  ]

  return [
    {
      id: 'read',
      label: 'Read',
      href: '/l/subscriptions',
      selected: group == 'read',
      pages: read,
    },
    {
      id: 'watch',
      label: 'Watch',
      href: '/l/watch',
      selected: group == 'watch',
      pages: watch,
    },
  ]
}

// How many items wait on a page: unseen in Feeds, unread in Saved, new
// videos in Channels, new suggestions in Discover. Zero shows nothing.
export function useNavCount(source: NavCountSource | undefined): number {
  const items = source?.kind == 'items' ? source : undefined
  const { data } = useGetLibraryItems(
    `nav-count-${items?.folder ?? 'none'}`,
    items?.folder ?? 'inbox',
    {
      limit: 1,
      sortDescending: true,
      searchQuery: items?.query ?? '',
      includeCount: true,
    },
    !!items,
    2 * 60 * 1000
  )
  const { data: suggestions } = useFeedSuggestions(source?.kind == 'discover')
  if (source?.kind == 'discover') {
    return suggestions?.suggestions.filter((s) => s.status == 'NEW').length ?? 0
  }
  if (!items) return 0
  return data?.pages[0]?.pageInfo.totalCount ?? 0
}
