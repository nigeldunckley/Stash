import { DotsThree, Plus, SlidersHorizontal } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useGetLibraryItems } from '../../../lib/networking/library_items/useLibraryItems'
import { Collection, COLLECTION_COLORS } from '../../../lib/watch/collections'
import {
  IconButton,
  PanelLabel,
  Popover,
  SegmentedControl,
  Switch,
} from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'

export const CollectionDot = styled('span', {
  flex: 'none',
  width: '7px',
  height: '7px',
  borderRadius: '50%',
  background: '$stMuted',
})

const Row = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  margin: '0 0 22px',
  overflowX: 'auto',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
  // Bleed to the screen's edge on a phone so chips scroll off it.
  '@smDown': { margin: '0 -16px 18px', padding: '0 16px' },
})

const Chip = styled('button', {
  all: 'unset',
  flex: 'none',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  height: '30px',
  padding: '0 12px',
  border: '1px solid $stLine',
  borderRadius: '999px',
  background: '$stSurface',
  fontFamily: '$inter',
  fontSize: '$small',
  fontWeight: 500,
  color: '$stInk',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: `background ${motion.fast}, border-color ${motion.fast}`,
  '&:hover': { borderColor: '$stLineStrong' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  '& > sup': {
    position: 'static',
    fontFamily: '$mono',
    fontSize: '11px',
    fontWeight: 400,
    color: '$stMuted',
  },
  '&[aria-pressed="true"]': {
    background: '$stInk',
    borderColor: '$stInk',
    color: '$stSurface',
    '& > sup': { color: 'inherit', opacity: 0.7 },
  },
  '&[data-drop="true"]': {
    borderColor: '$stAccent',
    background: '$stAccentTint',
  },
  variants: {
    quiet: {
      true: {
        borderStyle: 'dashed',
        color: '$stMuted',
        fontWeight: 400,
      },
    },
  },
})

const Form = styled('form', {
  display: 'grid',
  gap: '12px',
  width: '240px',
  maxWidth: '100%',
  '& input[type="text"]': {
    all: 'unset',
    boxSizing: 'border-box',
    height: '32px',
    padding: '0 10px',
    border: '1px solid $stLineStrong',
    borderRadius: '$sm',
    background: '$stSurface',
    fontFamily: '$inter',
    fontSize: '$small',
    color: '$stInk',
    '&:focus': { borderColor: '$stAccent' },
    '@mdDown': { fontSize: '16px', height: '38px' },
  },
})

const Swatches = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  '& button': {
    all: 'unset',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    cursor: 'pointer',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
    '&[aria-pressed="true"]': {
      boxShadow: '0 0 0 2px $colors$stSurface, 0 0 0 4px $colors$stInk',
    },
    '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  },
})

const Buttons = styled('div', {
  display: 'flex',
  gap: '8px',
  justifyContent: 'space-between',
})

export const SmallButton = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '30px',
  padding: '0 12px',
  border: '1px solid $stLineStrong',
  borderRadius: '$sm',
  background: '$stSurface',
  fontFamily: '$inter',
  fontSize: '$caption',
  fontWeight: 500,
  color: '$stInk',
  cursor: 'pointer',
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  '&:disabled': { opacity: 0.5, cursor: 'default' },
  variants: {
    primary: {
      true: {
        background: '$stAccent',
        borderColor: '$stAccent',
        color: '$stOnAccent',
        '&:hover': { background: '$stAccent', filter: 'brightness(1.05)' },
      },
    },
    danger: {
      true: {
        color: '$stAccentText',
        '&[data-confirm="true"]': {
          background: '$stAccent',
          borderColor: '$stAccent',
          color: '$stOnAccent',
        },
      },
    },
  },
})

// The unseen count on a collection's chip.
function useCollectionCount(id: string) {
  const query = useGetLibraryItems(
    `feeds-count-collection-${id}`,
    'following',
    {
      limit: 1,
      sortDescending: true,
      searchQuery: `type:video -is:seen collection:${id}`,
      includeCount: true,
    },
    true,
    2 * 60 * 1000
  )
  return query.data?.pages[0]?.pageInfo.totalCount
}

function CollectionChip(props: {
  collection: Collection
  selected: boolean
  onSelect: () => void
  onDropChannel?: (subscriptionId: string) => void
}): JSX.Element {
  const count = useCollectionCount(props.collection.id)
  const [over, setOver] = useState(false)
  return (
    <Chip
      aria-pressed={props.selected}
      data-drop={over}
      onClick={props.onSelect}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(CHANNEL_DRAG)) return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false)
        const id = event.dataTransfer.getData(CHANNEL_DRAG)
        if (id) props.onDropChannel?.(id)
      }}
    >
      <CollectionDot css={{ background: props.collection.color }} />
      {props.collection.name}
      {count ? <sup>{count > 99 ? '99+' : count}</sup> : null}
    </Chip>
  )
}

// What a dragged channel carries, so collections can take it.
export const CHANNEL_DRAG = 'application/x-stash-channel'

// Name and colour for a new or existing collection.
function CollectionForm(props: {
  collection?: Collection
  nextColor: string
  onSave: (name: string, color: string) => void
  onRemove?: () => void
}): JSX.Element {
  const [name, setName] = useState(props.collection?.name ?? '')
  const [color, setColor] = useState(props.collection?.color ?? props.nextColor)
  const [confirming, setConfirming] = useState(false)
  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) props.onSave(name.trim(), color)
      }}
    >
      <PanelLabel>
        {props.collection ? 'Collection' : 'New collection'}
      </PanelLabel>
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Tech, Motorsport, Cooking…"
        aria-label="Collection name"
        autoFocus
        maxLength={64}
      />
      <Swatches role="group" aria-label="Colour">
        {COLLECTION_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Colour ${swatch}`}
            aria-pressed={swatch.toLowerCase() == color.toLowerCase()}
            style={{ background: swatch }}
            onClick={() => setColor(swatch)}
          />
        ))}
      </Swatches>
      <Buttons>
        {props.onRemove ? (
          <SmallButton
            type="button"
            danger
            data-confirm={confirming}
            onBlur={() => setConfirming(false)}
            onClick={() =>
              confirming ? props.onRemove?.() : setConfirming(true)
            }
          >
            {confirming ? 'Click again to delete' : 'Delete'}
          </SmallButton>
        ) : (
          <span />
        )}
        <SmallButton type="submit" primary disabled={!name.trim()}>
          {props.collection ? 'Save' : 'Create'}
        </SmallButton>
      </Buttons>
    </Form>
  )
}

// Chips across the top of Watch: All, then each collection with its count of
// new videos. A channel dragged from the list onto a chip moves there.
export function CollectionChips(props: {
  collections: Collection[]
  selected?: Collection
  allCount?: number
  onSelect: (collection?: Collection) => void
  onCreate: (name: string, color: string) => void
  onUpdate: (collection: Collection, name: string, color: string) => void
  onRemove: (collection: Collection) => void
  onDropChannel: (subscriptionId: string, collection: Collection) => void
}): JSX.Element {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const nextColor =
    COLLECTION_COLORS[props.collections.length % COLLECTION_COLORS.length]
  return (
    <Row role="toolbar" aria-label="Collections">
      <Chip aria-pressed={!props.selected} onClick={() => props.onSelect()}>
        All
        {props.allCount ? (
          <sup>{props.allCount > 999 ? '999+' : props.allCount}</sup>
        ) : null}
      </Chip>
      {props.collections.map((collection) => (
        <CollectionChip
          key={collection.id}
          collection={collection}
          selected={props.selected?.id == collection.id}
          onSelect={() =>
            props.onSelect(
              props.selected?.id == collection.id ? undefined : collection
            )
          }
          onDropChannel={(id) => props.onDropChannel(id, collection)}
        />
      ))}
      {props.selected && (
        <Popover
          label="Edit collection"
          align="start"
          open={editing}
          onOpenChange={setEditing}
          trigger={
            <IconButton label={`Edit ${props.selected.name}`} size="sm">
              <DotsThree size={16} weight="bold" />
            </IconButton>
          }
        >
          <CollectionForm
            key={props.selected.id}
            collection={props.selected}
            nextColor={nextColor}
            onSave={(name, color) => {
              setEditing(false)
              if (props.selected) props.onUpdate(props.selected, name, color)
            }}
            onRemove={() => {
              setEditing(false)
              if (props.selected) props.onRemove(props.selected)
            }}
          />
        </Popover>
      )}
      <Popover
        label="New collection"
        align="start"
        open={creating}
        onOpenChange={setCreating}
        trigger={
          <Chip quiet aria-label="New collection">
            <Plus size={12} weight="bold" />
            {props.collections.length ? 'New' : 'New collection'}
          </Chip>
        }
      >
        <CollectionForm
          nextColor={nextColor}
          onSave={(name, color) => {
            setCreating(false)
            props.onCreate(name, color)
          }}
        />
      </Popover>
    </Row>
  )
}

const Select = styled('select', {
  all: 'unset',
  boxSizing: 'border-box',
  height: '30px',
  padding: '0 26px 0 10px',
  border: '1px solid $stLineStrong',
  borderRadius: '$sm',
  background: `$stSurface url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.4'/%3E%3C/svg%3E") no-repeat right 9px center`,
  fontFamily: '$inter',
  fontSize: '$caption',
  color: '$stInk',
  cursor: 'pointer',
  maxWidth: '100%',
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  '@mdDown': { fontSize: '16px', height: '36px' },
})

const NEW = '__new__'

// Picks a collection, or none. "New collection…" asks for a name.
export function CollectionSelect(props: {
  collections: Collection[]
  value?: string | null
  label: string
  onChange: (collectionId: string | null) => void
  onCreate: (name: string) => Promise<Collection | undefined>
}): JSX.Element {
  return (
    <Select
      aria-label={props.label}
      value={props.value ?? ''}
      onChange={async (event) => {
        const value = event.target.value
        if (value == NEW) {
          const name = window.prompt('Name the new collection')
          const created = name ? await props.onCreate(name) : undefined
          if (created) props.onChange(created.id)
          return
        }
        props.onChange(value || null)
      }}
    >
      <option value="">No collection</option>
      {props.collections.map((collection) => (
        <option key={collection.id} value={collection.id}>
          {collection.name}
        </option>
      ))}
      <option value={NEW}>New collection…</option>
    </Select>
  )
}

// Filters for the videos on show: length, and whether to hide watched ones.
export type WatchFilters = {
  length: 'any' | 'short' | 'medium' | 'long'
  hideWatched: boolean
}

const FILTERS_KEY = 'watch-filters'
const NO_FILTERS: WatchFilters = { length: 'any', hideWatched: false }

// A video's word count is its length in seconds times 3.92.
const WORDS_PER_MINUTE = 235

export const filterQuery = (filters: WatchFilters) =>
  [
    filters.length == 'short'
      ? `wordscount:<${10 * WORDS_PER_MINUTE}`
      : filters.length == 'medium'
      ? `wordscount:>=${10 * WORDS_PER_MINUTE} wordscount:<${
          30 * WORDS_PER_MINUTE
        }`
      : filters.length == 'long'
      ? `wordscount:>=${30 * WORDS_PER_MINUTE}`
      : '',
    filters.hideWatched ? '-is:read' : '',
  ]
    .filter(Boolean)
    .join(' ')

export function useWatchFilters() {
  const [filters, setFilters] = useState<WatchFilters>(NO_FILTERS)
  useEffect(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(FILTERS_KEY) ?? 'null'
      )
      if (stored && typeof stored == 'object') {
        setFilters({ ...NO_FILTERS, ...stored })
      }
    } catch {
      // Storage is unavailable; show everything.
    }
  }, [])
  const change = (next: WatchFilters) => {
    setFilters(next)
    try {
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify(next))
    } catch {
      // Storage is unavailable; the filters last until the page closes.
    }
  }
  return [filters, change] as const
}

const FilterRow = styled('label', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  fontFamily: '$inter',
  fontSize: '$small',
  color: '$stInk2',
})

export function WatchFilterMenu(props: {
  filters: WatchFilters
  onChange: (filters: WatchFilters) => void
}): JSX.Element {
  const on = props.filters.length != 'any' || props.filters.hideWatched
  return (
    <Popover
      label="Filter videos"
      trigger={
        <IconButton label="Filter videos" active={on}>
          <SlidersHorizontal size={16} weight={on ? 'bold' : 'regular'} />
        </IconButton>
      }
    >
      <div style={{ display: 'grid', gap: 14, width: 250, maxWidth: '100%' }}>
        <PanelLabel>Length</PanelLabel>
        <SegmentedControl
          label="Length"
          value={props.filters.length}
          onChange={(length) => props.onChange({ ...props.filters, length })}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'short', label: '<10m' },
            { value: 'medium', label: '10–30' },
            { value: 'long', label: '30m+' },
          ]}
        />
        <FilterRow>
          Hide watched
          <Switch
            label="Hide watched"
            checked={props.filters.hideWatched}
            onChange={(hideWatched) =>
              props.onChange({ ...props.filters, hideWatched })
            }
          />
        </FilterRow>
      </div>
    </Popover>
  )
}
