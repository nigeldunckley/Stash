import { Archive, Bookmark, Tag, Trash } from '@phosphor-icons/react'
import { useState } from 'react'
import {
  BottomSheet,
  IconButton,
  ItemList,
  ItemRow,
  Kbd,
  PageMeta,
  PageTitle,
  PanelLabel,
  Popover,
  ProgressLine,
  ProgressRing,
  SectionHeader,
  SegmentedControl,
  SiteIcon,
  UnseenDot,
} from '../../components/elements/stash'
import { GridFallbackImage } from '../../components/patterns/LibraryCards/FallbackImage'
import {
  apolloTheme,
  darkTheme,
  styled,
} from '../../components/tokens/stitches.config'
import { formatMinutes, minutesLeft } from '../../lib/readingTime'

const Column = styled('div', {
  flex: '1 1 340px',
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: '16px',
  padding: '20px',
  background: '$stCanvas',
  color: '$stInk',
  fontFamily: '$inter',
})

const SAMPLE = [
  {
    title: 'The Web We Lost',
    source: 'anildash.com',
    author: 'Anil Dash',
    words: 2800,
    progress: 0,
  },
  {
    title: 'How to Do Great Work',
    source: 'paulgraham.com',
    author: 'Paul Graham',
    words: 11240,
    progress: 38,
  },
  {
    title: 'Write Simply',
    source: 'paulgraham.com',
    author: 'Paul Graham',
    words: 700,
    progress: 100,
  },
]

const Gallery = (props: { name: string }): JSX.Element => {
  const [layout, setLayout] = useState<'list' | 'grid'>('list')
  const [selected, setSelected] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <PageTitle>{props.name}</PageTitle>
        <PageMeta>14 unread · 3h 40m</PageMeta>
        <span style={{ flex: 1 }} />
        <SegmentedControl
          label="Layout"
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'list', label: 'List' },
            { value: 'grid', label: 'Grid' },
          ]}
        />
      </div>
      <SectionHeader
        title="Recently saved"
        meta="this week"
        action={<a href="#">Library</a>}
      />
      <ItemList>
        {SAMPLE.map((item, index) => (
          <ItemRow
            key={item.title}
            leading={<SiteIcon name={item.source} />}
            title={item.title}
            subtitle={`${item.author} · ${item.source}`}
            selected={index === selected}
            onMouseEnter={() => setSelected(index)}
            meta={
              <>
                {formatMinutes(minutesLeft(item.words, item.progress))}
                <ProgressRing percent={item.progress} />
              </>
            }
            actions={
              <>
                <IconButton label="Archive" shortcut="e" size="sm">
                  <Archive size={15} />
                </IconButton>
                <IconButton label="Labels" shortcut="l" size="sm">
                  <Tag size={15} />
                </IconButton>
                <IconButton label="Delete" shortcut="#" size="sm">
                  <Trash size={15} />
                </IconButton>
              </>
            }
          />
        ))}
      </ItemList>
      <SectionHeader title="New from feeds" meta="2 unseen" />
      <ItemList>
        <ItemRow
          leading={<UnseenDot />}
          title="Notes on building calm software"
          subtitle="Calm Software · 2 hours ago"
          excerpt="Most software is designed to be urgent. A few products choose not to be, and they tend to last longer."
          meta="6 min"
          actions={
            <IconButton label="Save to Library" shortcut="s" size="sm">
              <Bookmark size={15} />
            </IconButton>
          }
        />
        <ItemRow
          leading={<UnseenDot hidden />}
          title="Ten years of quieter software"
          subtitle="Calm Software · last week"
          meta="9 min"
          muted
        />
      </ItemList>
      <ProgressLine percent={38} />
      <div
        style={{
          border: '1px solid var(--colors-stLine)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <GridFallbackImage
          title="Write Simply"
          source="paulgraham.com"
          width="100%"
          height="120px"
          fontSize="16px"
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Popover
          label="Text settings"
          trigger={
            <IconButton label="Text settings" shortcut="a">
              Aa
            </IconButton>
          }
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <PanelLabel>Theme</PanelLabel>
            <div>Light · Dim · Dark</div>
          </div>
        </Popover>
        <IconButton
          label="Open bottom sheet"
          onClick={() => setSheetOpen(true)}
        >
          <Tag size={15} />
        </IconButton>
        <Kbd>j</Kbd>
        <Kbd>k</Kbd>
        <Kbd>/</Kbd>
      </div>
      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Highlights"
      >
        <p style={{ margin: 0 }}>Bottom sheet content.</p>
      </BottomSheet>
    </>
  )
}

// A gallery of the shared Stash components in each theme, for review and screenshots.
export default function StashUiGallery(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: '100vh' }}>
      <Column>
        <Gallery name="Light" />
      </Column>
      <Column className={apolloTheme.className}>
        <Gallery name="Dim" />
      </Column>
      <Column className={darkTheme.className}>
        <Gallery name="Dark" />
      </Column>
    </div>
  )
}
