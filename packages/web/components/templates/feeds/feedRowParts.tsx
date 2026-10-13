import { useEffect, useState } from 'react'
import { State } from '../../../lib/networking/fragments/articleFragment'
import type { LibraryItemNode } from '../../../lib/networking/library_items/useLibraryItems'
import { styled } from '../../tokens/stitches.config'

// Pieces of a feed item's row, shared by Feeds and Home.

// The source at the start of a row's subtitle, with its favicon.
export const RowSource = styled('span', {
  '& > span:first-child': { verticalAlign: '-3px', marginRight: '6px' },
  time: { fontVariantNumeric: 'tabular-nums' },
})

// A thin dot between byline parts, lighter than the text around it.
export const Dot = (): JSX.Element => (
  <span aria-hidden="true" style={{ margin: '0 6px', opacity: 0.5 }}>
    ·
  </span>
)

// The full publish date, for the tooltip on a row's age.
export const publishedLabel = (item: LibraryItemNode): string | undefined => {
  const date = item.publishedAt || item.savedAt
  return date ? new Date(date).toLocaleString() : undefined
}

export const isVisible = (item: LibraryItemNode): boolean =>
  item.state !== State.ARCHIVED && item.state !== State.DELETED

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])
  return matches
}
