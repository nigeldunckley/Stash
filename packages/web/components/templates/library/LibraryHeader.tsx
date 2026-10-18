import {
  Archive,
  Checks,
  MagnifyingGlass,
  Rows,
  SquaresFour,
  Tag,
  Tray,
  Trash,
  X,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { Label } from '../../../lib/networking/fragments/labelFragment'
import { searchBarCommands } from '../../../lib/keyboardShortcuts/navigationShortcuts'
import { useKeyboardShortcuts } from '../../../lib/keyboardShortcuts/useKeyboardShortcuts'
import { BulkAction } from '../../../lib/networking/library_items/useLibraryItems'
import { UserBasicData } from '../../../lib/networking/queries/useGetViewerQuery'
import { IconButton, Kbd, SegmentedControl } from '../../elements/stash'
import { motion, pressable } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import { LayoutType } from '../homeFeed/HomeFeedContainer'
import type { MultiSelectMode } from '../homeFeed/LibraryHeader'
import { ConfirmationModal } from '../../patterns/ConfirmationModal'
import { AddBulkLabelsModal } from '../article/AddBulkLabelsModal'

export type LibraryHeaderProps = {
  viewer: UserBasicData | undefined

  layout: LayoutType
  updateLayout: (layout: LayoutType) => void

  folder: string | undefined
  searchTerm: string | undefined
  applySearchQuery: (searchQuery: string) => void

  showFilterMenu: boolean

  numItemsSelected: number
  multiSelectMode: MultiSelectMode
  setMultiSelectMode: (mode: MultiSelectMode) => void

  performMultiSelectAction: (action: BulkAction, labelIds?: string[]) => void
}

const TITLES: Record<string, string> = {
  inbox: 'Saved',
  archive: 'Archive',
  trash: 'Trash',
}

// Quick filters for the Library, added to the folder's own query.
type Filter = 'all' | 'unread' | 'reading'
const FILTERS: { value: Filter; label: string; query: string }[] = [
  { value: 'all', label: 'All', query: '' },
  { value: 'unread', label: 'Unread', query: 'is:unread' },
  { value: 'reading', label: 'In progress', query: 'is:reading' },
]

const Header = styled('header', {
  width: '100%',
  margin: '0 auto',
  boxSizing: 'border-box',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: '14px',
  paddingBottom: '6px',
  fontFamily: '$inter',
  color: '$stInk',
  // Line up with the list or grid below.
  variants: {
    layout: {
      list: { maxWidth: '880px' },
      grid: {
        paddingLeft: '70px',
        paddingRight: '70px',
        '@xlgDown': { paddingLeft: 0, paddingRight: 0 },
      },
    },
  },
  '@mdDown': {
    paddingLeft: '16px !important',
    paddingRight: '16px !important',
  },
})

const TitleRow = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minHeight: '36px',
})

const Title = styled('h1', {
  margin: 0,
  fontFamily: '$inter',
  fontSize: '26px',
  fontWeight: 600,
  lineHeight: 1.15,
  letterSpacing: '-0.028em',
  color: '$stInk',
  '@mdDown': { fontSize: '30px' },
})

const Trailing = styled('div', {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
})

const TextButton = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  height: '30px',
  padding: '0 10px',
  borderRadius: '$sm',
  fontSize: '$small',
  fontWeight: 500,
  color: '$stInk2',
  cursor: 'pointer',
  transition: `background ${motion.fast}, transform ${motion.fast}`,
  ...pressable,
  '@media (hover: hover)': { '&:hover': { background: '$stSunken' } },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
})

const Controls = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
})

// A macOS-style search field: a soft grey well, the glass on the left and
// the / shortcut on the right until there is something to clear. ⌘F also
// focuses it while the Library is open.
const Field = styled('form', {
  flex: '1 1 260px',
  maxWidth: '420px',
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: '32px',
  padding: '0 6px 0 10px',
  boxSizing: 'border-box',
  borderRadius: '8px',
  background: '$stSunken',
  border: '1px solid transparent',
  color: '$stMuted',
  transition: `border-color ${motion.fast}, background ${motion.fast}, box-shadow ${motion.fast}`,
  '&:focus-within': {
    background: '$stSurface',
    borderColor: '$stAccent',
    boxShadow: '0 0 0 3px $colors$stAccentTint',
  },
  input: {
    all: 'unset',
    flex: 1,
    minWidth: 0,
    fontFamily: '$inter',
    fontSize: '14px',
    color: '$stInk',
    '&::placeholder': { color: '$stMuted' },
  },
  '@mdDown': { maxWidth: 'none', marginLeft: 0, flexBasis: '100%' },
})

const Clear = styled('button', {
  all: 'unset',
  display: 'grid',
  placeItems: 'center',
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  background: '$stMuted',
  color: '$stSurface',
  cursor: 'pointer',
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
})

export function LibraryHeader(props: LibraryHeaderProps): JSX.Element {
  const title = TITLES[props.folder ?? ''] ?? 'Search'
  const selecting = props.multiSelectMode !== 'off'
  const search = (props.searchTerm ?? '').trim()
  const filter = FILTERS.find((f) => f.query === search)?.value

  return (
    <Header layout={props.layout == 'GRID_LAYOUT' ? 'grid' : 'list'}>
      <TitleRow>
        <Title>{title}</Title>
        <Trailing>
          {props.folder !== 'trash' && (
            <TextButton
              type="button"
              aria-pressed={selecting}
              onClick={() =>
                props.setMultiSelectMode(selecting ? 'off' : 'none')
              }
            >
              {selecting ? 'Done' : 'Select'}
            </TextButton>
          )}
          <IconButton
            label={
              props.layout == 'GRID_LAYOUT'
                ? 'Show as a list'
                : 'Show as a grid'
            }
            onClick={() =>
              props.updateLayout(
                props.layout == 'GRID_LAYOUT' ? 'LIST_LAYOUT' : 'GRID_LAYOUT'
              )
            }
          >
            {props.layout == 'GRID_LAYOUT' ? (
              <Rows size={18} />
            ) : (
              <SquaresFour size={18} />
            )}
          </IconButton>
        </Trailing>
      </TitleRow>
      {selecting ? (
        <SelectionBar {...props} />
      ) : (
        <Controls>
          {props.folder == 'inbox' && (
            <SegmentedControl
              label="Show"
              options={FILTERS}
              value={filter ?? ('' as Filter)}
              onChange={(value) =>
                props.applySearchQuery(
                  FILTERS.find((f) => f.value == value)?.query ?? ''
                )
              }
            />
          )}
          <SearchField {...props} />
        </Controls>
      )}
    </Header>
  )
}

function SearchField(props: LibraryHeaderProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isFilter = FILTERS.some(
    (f) => f.query && f.query === (props.searchTerm ?? '').trim()
  )
  // A quick filter's query isn't a search, so it stays out of the field.
  const shown = isFilter ? '' : props.searchTerm ?? ''
  const [searchTerm, setSearchTerm] = useState(shown)

  useEffect(() => {
    setSearchTerm(shown)
  }, [shown])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() == 'f') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useKeyboardShortcuts(
    searchBarCommands((action) => {
      if (action === 'focusSearchBar' && inputRef.current) {
        inputRef.current.select()
      }
      if (action == 'clearSearch' && inputRef.current) {
        setSearchTerm('')
        props.applySearchQuery('')
      }
    })
  )

  return (
    <Field
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        props.applySearchQuery(searchTerm.trim())
        inputRef.current?.blur()
      }}
    >
      <MagnifyingGlass size={15} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        value={searchTerm}
        aria-label="Search keywords or labels"
        placeholder="Search keywords or labels"
        onFocus={(event) => event.target.select()}
        onChange={(event) => setSearchTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key.toLowerCase() == 'escape') {
            event.currentTarget.blur()
          }
        }}
      />
      {searchTerm ? (
        <Clear
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setSearchTerm('')
            props.applySearchQuery('')
            inputRef.current?.blur()
          }}
        >
          <X size={10} weight="bold" />
        </Clear>
      ) : (
        <Kbd>/</Kbd>
      )}
    </Field>
  )
}

const Bar = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  height: '40px',
  padding: '0 4px 0 12px',
  borderRadius: '10px',
  border: '1px solid $stLine',
  background: '$stSurface',
  fontSize: '$small',
  color: '$stInk2',
  fontVariantNumeric: 'tabular-nums',
})

const Count = styled('span', {
  marginRight: 'auto',
  fontWeight: 500,
  color: '$stInk',
})

const Danger = styled('span', { color: '$stDanger', display: 'contents' })

function SelectionBar(props: LibraryHeaderProps): JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const count = props.numItemsSelected
  const none = count < 1
  const allShown =
    props.multiSelectMode == 'visible' || props.multiSelectMode == 'search'

  return (
    <Bar role="toolbar" aria-label="Selected items">
      <Count aria-live="polite">
        {none ? 'Select items' : `${count} selected`}
      </Count>
      <TextButton
        type="button"
        onClick={() => props.setMultiSelectMode(allShown ? 'none' : 'visible')}
      >
        {allShown ? 'Deselect all' : 'Select all'}
      </TextButton>
      {props.folder !== 'archive' && (
        <IconButton
          label="Archive"
          disabled={none}
          onClick={() => props.performMultiSelectAction(BulkAction.ARCHIVE)}
        >
          <Archive size={18} />
        </IconButton>
      )}
      {props.folder == 'subscriptions' && (
        <IconButton
          label="Move to Library"
          disabled={none}
          onClick={() =>
            props.performMultiSelectAction(BulkAction.MOVE_TO_FOLDER)
          }
        >
          <Tray size={18} />
        </IconButton>
      )}
      <IconButton
        label="Add labels"
        disabled={none}
        onClick={() => setShowLabels(true)}
      >
        <Tag size={18} />
      </IconButton>
      <IconButton
        label="Mark as read"
        disabled={none}
        onClick={() => props.performMultiSelectAction(BulkAction.MARK_AS_READ)}
      >
        <Checks size={18} />
      </IconButton>
      {props.folder !== 'trash' && (
        <IconButton
          label="Delete"
          disabled={none}
          onClick={() => setConfirmDelete(true)}
        >
          <Danger>
            <Trash size={18} />
          </Danger>
        </IconButton>
      )}
      {confirmDelete && (
        <ConfirmationModal
          message={`Delete ${count} ${
            count == 1 ? 'item' : 'items'
          }? Their notes and highlights will be deleted too.`}
          acceptButtonLabel="Delete"
          onAccept={() => props.performMultiSelectAction(BulkAction.DELETE)}
          onOpenChange={() => setConfirmDelete(false)}
        />
      )}
      {showLabels && (
        <AddBulkLabelsModal
          bulkSetLabels={(labels: Label[]) =>
            props.performMultiSelectAction(
              BulkAction.ADD_LABELS,
              labels.map((l) => l.id)
            )
          }
          onOpenChange={() => setShowLabels(false)}
        />
      )}
    </Bar>
  )
}
