import {
  LibraryItemNode,
  useGetLibraryItems,
} from '../../../lib/networking/library_items/useLibraryItems'
import { shortTimeAgo } from '../../../lib/textFormatting'
import { ContextMenu, MenuEntry } from '../../elements/stash'
import { styled } from '../../tokens/stitches.config'
import { VideoCard, VideoGroup } from '../feeds/VideoCard'
import { isVisible } from '../feeds/feedRowParts'

// Videos started and not finished, from the channels or Saved.
export const CONTINUE_QUERY =
  'use:folders (in:following OR in:inbox) type:video is:reading sort:read-desc'

// One row of cards on a Mac; on a phone the row scrolls sideways.
const Row = styled('div', {
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: 'minmax(232px, calc((100% - 54px) / 4))',
  gap: '18px',
  overflowX: 'auto',
  scrollSnapType: 'x mandatory',
  scrollbarWidth: 'none',
  paddingBottom: '2px',
  '&::-webkit-scrollbar': { display: 'none' },
  '& > *': { scrollSnapAlign: 'start' },
  '@smDown': { gridAutoColumns: '78%', gap: '14px' },
})

const Section = styled('section', {
  marginBottom: '30px',
  '@smDown': { marginBottom: '26px' },
})

export function ContinueWatching(props: {
  // Narrows the row to a collection or length.
  scope?: string
  menuFor?: (item: LibraryItemNode) => MenuEntry[]
  now: number
  sourceName: (item: LibraryItemNode) => string
  sourceIcon: (item: LibraryItemNode) => string | undefined
  onOpen: (item: LibraryItemNode) => void
  onSave: (item: LibraryItemNode) => void
  onArchive: (item: LibraryItemNode) => void
  onOpenOriginal: (item: LibraryItemNode) => void
}): JSX.Element | null {
  const { data } = useGetLibraryItems(
    `watch-continue${props.scope ? `-${props.scope}` : ''}`,
    undefined,
    {
      limit: 8,
      sortDescending: true,
      searchQuery: [CONTINUE_QUERY, props.scope].filter(Boolean).join(' '),
    }
  )
  const items = (data?.pages[0]?.edges ?? [])
    .map((edge) => edge.node)
    .filter(isVisible)
  if (!items.length) {
    return null
  }
  return (
    <Section aria-label="Continue watching">
      <VideoGroup>Continue watching</VideoGroup>
      <Row>
        {items.map((item) => (
          <ContextMenu key={item.id} entries={props.menuFor?.(item) ?? []}>
            <VideoCard
              key={item.id}
              item={item}
              channelName={props.sourceName(item)}
              channelIcon={props.sourceIcon(item)}
              showChannel
              age={shortTimeAgo(item.publishedAt || item.savedAt, props.now)}
              seen
              saved={false}
              // Started channel videos can still be saved.
              queued={item.folder == 'inbox'}
              selected={false}
              onOpen={() => props.onOpen(item)}
              onFocus={() => undefined}
              onSave={() => props.onSave(item)}
              onArchive={() => props.onArchive(item)}
              onOpenOriginal={() => props.onOpenOriginal(item)}
            />
          </ContextMenu>
        ))}
      </Row>
    </Section>
  )
}
