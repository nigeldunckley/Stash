// Every channel you follow, grouped by collection, as cards you can pick up
// and drop into another collection. Collections move up and down by their
// handle. On iPhone, press and hold a channel to pick it up; the ⋯ button on
// each card and heading does the same from a menu.

import {
  ArrowDown,
  ArrowUp,
  DotsSixVertical,
  DotsThree,
  Plus,
} from '@phosphor-icons/react'
import {
  CSSProperties,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Subscription } from '../../../lib/networking/queries/useGetSubscriptionsQuery'
import { Collection, COLLECTION_COLORS } from '../../../lib/watch/collections'
import { IconButton, Popover, SiteIcon } from '../../elements/stash'
import { floatingShadow } from '../../elements/stash/material'
import { menuItemStyles, menuSeparatorStyles } from '../../elements/stash/Menu'
import { motion, reducedMotion, spring } from '../../elements/stash/motion'
import { keyframes, styled } from '../../tokens/stitches.config'
import { CollectionDot, CollectionForm } from './Collections'

// Where a channel can land: a collection's id, out of every collection, or
// a new collection made on the spot.
const NONE = 'none'
const NEW = 'new'

// How long a finger rests on a card before it lifts, and how far it may
// wander first (further is a scroll).
const HOLD_MS = 320
const HOLD_SLOP = 8
// How far the mouse moves before a press becomes a drag, so clicks still
// open the channel.
const DRAG_SLOP = 4
// Near the top or bottom of the window the page scrolls under the drag.
const EDGE = 72

type Drag = {
  kind: 'channel' | 'collection'
  id: string
  x: number
  y: number
  // Where the card was held, so it stays under the finger.
  dx: number
  dy: number
  width: number
  height: number
  over?: string
}

const Intro = styled('p', {
  margin: '0 0 22px',
  fontSize: '$small',
  color: '$stMuted',
  '& [data-touch]': { display: 'none' },
  '@media (pointer: coarse)': {
    '& [data-mouse]': { display: 'none' },
    '& [data-touch]': { display: 'inline' },
  },
})

const Board = styled('div', {
  position: 'relative',
  display: 'grid',
  gap: '10px',
  paddingBottom: '40px',
  '&[data-dragging="true"]': {
    cursor: 'grabbing',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
})

const Section = styled('section', {
  position: 'relative',
  padding: '10px',
  margin: '0 -10px',
  borderRadius: '$md',
  border: '1px solid transparent',
  transition: `background ${motion.fast}, border-color ${motion.fast}, box-shadow ${motion.fast}`,
  '&[data-over="true"]': {
    background: '$stAccentTint',
    borderColor: '$stAccent',
  },
  '&[data-lifted="true"]': { opacity: 0.35 },
})

const Heading = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minHeight: '30px',
  marginBottom: '10px',
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '$stMuted',
  '& > [data-name]': {
    color: '$stInk',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& > [data-hint]': {
    color: '$stAccentText',
    opacity: 0,
    transition: `opacity ${motion.fast}`,
  },
  '[data-over="true"] > & > [data-hint]': { opacity: 1 },
  // Folded while collections are being reordered, so each is one line.
  '[data-folded="true"] &': { marginBottom: 0 },
})

const Handle = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'grid',
  placeItems: 'center',
  width: '22px',
  height: '26px',
  marginLeft: '-4px',
  borderRadius: '$sm',
  color: '$stMuted',
  cursor: 'grab',
  touchAction: 'none',
  transition: `background ${motion.fast}, color ${motion.fast}`,
  '&:hover': { background: '$stSunken', color: '$stInk' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-2px' },
})

const Grid = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '8px',
  '@smDown': { gridTemplateColumns: 'minmax(0, 1fr)' },
  '[data-folded="true"] &': { display: 'none' },
})

const Card = styled('div', {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '32px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '10px',
  height: '56px',
  padding: '0 6px 0 12px',
  boxSizing: 'border-box',
  border: '1px solid $stLine',
  borderRadius: '$md',
  background: '$stSurface',
  cursor: 'grab',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  transition: `border-color ${motion.fast}, opacity ${motion.fast}, transform ${motion.fast}`,
  '&:hover': { borderColor: '$stLineStrong' },
  '&:focus-within': { borderColor: '$stLineStrong' },
  // Pressing and holding on a phone: the card sinks a little to say it is
  // about to lift.
  '&[data-holding="true"]': { transform: 'scale(0.97)' },
  // The gap a lifted card leaves behind.
  '&[data-lifted="true"]': {
    opacity: 0.35,
    borderStyle: 'dashed',
    borderColor: '$stLineStrong',
  },
  '& > [data-name]': {
    all: 'unset',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: '$inter',
    fontSize: '$small',
    fontWeight: 500,
    color: '$stInk',
    cursor: 'inherit',
    '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
    '&::after': { content: '""', position: 'absolute', inset: 0 },
  },
  '& > [data-more]': { position: 'relative', zIndex: 1 },
  '@smDown': { height: '52px', paddingLeft: '10px', gap: '8px' },
  [reducedMotion]: { '&[data-holding="true"]': { transform: 'none' } },
})

// An empty collection, waiting for channels.
const Empty = styled('div', {
  display: 'grid',
  placeItems: 'center',
  height: '56px',
  border: '1px dashed $stLineStrong',
  borderRadius: '$md',
  fontSize: '$caption',
  color: '$stMuted',
  '[data-over="true"] &': { borderColor: '$stAccent', color: '$stAccentText' },
})

const NewZone = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: '56px',
  marginTop: '6px',
  border: '1px dashed $stLineStrong',
  borderRadius: '$md',
  fontFamily: '$inter',
  fontSize: '$small',
  color: '$stMuted',
  cursor: 'pointer',
  transition: `background ${motion.fast}, border-color ${motion.fast}, color ${motion.fast}`,
  '&:hover': { color: '$stInk', borderColor: '$stMuted' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  '&[data-over="true"]': {
    background: '$stAccentTint',
    borderColor: '$stAccent',
    borderStyle: 'solid',
    color: '$stAccentText',
  },
})

const lift = keyframes({
  from: { transform: 'scale(1) rotate(0deg)', boxShadow: 'none' },
  to: { transform: 'scale(1.04) rotate(-1.5deg)' },
})

// The card under the pointer while it is carried.
const Ghost = styled('div', {
  position: 'fixed',
  top: 0,
  left: 0,
  zIndex: 1000,
  pointerEvents: 'none',
  willChange: 'transform',
  '& > *': {
    transform: 'scale(1.04) rotate(-1.5deg)',
    boxShadow: floatingShadow,
    borderColor: '$stLineStrong',
    background: '$stSurface',
    animation: `${lift} 180ms ${spring}`,
  },
  [reducedMotion]: {
    '& > *': { transform: 'none', animation: 'none' },
  },
})

const GhostHeading = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: '44px',
  padding: '0 12px',
  boxSizing: 'border-box',
  border: '1px solid $stLine',
  borderRadius: '$md',
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '$stInk',
})

const MenuList = styled('div', {
  display: 'grid',
  minWidth: '200px',
  margin: '-4px',
  '& > button': {
    ...menuItemStyles,
    cursor: 'pointer',
    fontFamily: '$inter',
    fontSize: '13.5px',
    '&:hover, &:focus-visible': { background: '$stSunken' },
    '&[aria-checked="true"]::after': {
      content: '"✓"',
      marginLeft: 'auto',
      color: '$stAccentText',
      fontSize: '12px',
    },
  },
  '& > hr': { ...menuSeparatorStyles, border: 0 },
  '& > span': {
    padding: '6px 10px 4px',
    fontFamily: '$mono',
    fontSize: '$micro',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '$stMuted',
  },
})

const prefersReducedMotion = () =>
  typeof window != 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Slides cards and headings from where they were to where they are now,
// whenever the board changes. `from` can say where one should start instead,
// such as the spot a carried card was dropped.
function useFlip(board: React.RefObject<HTMLElement>, key: string) {
  const last = useRef(new Map<string, DOMRect>())
  const from = useRef(new Map<string, DOMRect>())
  useLayoutEffect(() => {
    const root = board.current
    if (!root) return
    const next = new Map<string, DOMRect>()
    const still = prefersReducedMotion()
    root.querySelectorAll<HTMLElement>('[data-flip]').forEach((element) => {
      const id = element.dataset.flip as string
      const rect = element.getBoundingClientRect()
      const page = new DOMRect(
        rect.left + window.scrollX,
        rect.top + window.scrollY,
        rect.width,
        rect.height
      )
      next.set(id, page)
      const before = from.current.get(id) ?? last.current.get(id)
      if (!before || still) return
      const dx = before.left - page.left
      const dy = before.top - page.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      element.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0, 0)' },
        ],
        { duration: 420, easing: spring }
      )
    })
    last.current = next
    from.current = new Map()
  }, [board, key])
  return from
}

// One menu row per collection, plus "No collection" and "New collection…".
function MoveMenu(props: {
  channel: Subscription
  collections: Collection[]
  onMove: (collectionId: string | null) => void
  onNew: () => void
}): JSX.Element {
  return (
    <MenuList role="menu" aria-label={`Move ${props.channel.name}`}>
      <span>Move to</span>
      {props.collections.map((collection) => (
        <button
          key={collection.id}
          role="menuitemradio"
          aria-checked={props.channel.collectionId == collection.id}
          onClick={() => props.onMove(collection.id)}
        >
          <CollectionDot css={{ background: collection.color }} />
          {collection.name}
        </button>
      ))}
      <button
        role="menuitemradio"
        aria-checked={!props.channel.collectionId}
        onClick={() => props.onMove(null)}
      >
        <CollectionDot css={{ background: 'transparent' }} />
        No collection
      </button>
      <hr />
      <button role="menuitem" onClick={props.onNew}>
        <Plus size={12} weight="bold" />
        New collection…
      </button>
    </MenuList>
  )
}

function ChannelCard(props: {
  channel: Subscription
  collections: Collection[]
  lifted: boolean
  count?: ReactNode
  onPress: (event: React.PointerEvent | React.TouchEvent) => void
  holding: boolean
  onOpen: () => void
  onMove: (collectionId: string | null) => void
  onNew: () => void
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const { channel } = props
  return (
    <Card
      data-flip={`channel-${channel.id}`}
      data-card={channel.id}
      data-lifted={props.lifted}
      data-holding={props.holding}
      onPointerDown={(event) => {
        if (event.pointerType != 'touch') props.onPress(event)
      }}
      onTouchStart={props.onPress}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      <SiteIcon src={channel.icon} name={channel.name} size={32} round />
      <button data-name="" title={channel.name} onClick={props.onOpen}>
        {channel.name}
      </button>
      <span data-more="" style={{ display: 'flex', alignItems: 'center' }}>
        {props.count}
        <Popover
          label={`Move ${channel.name}`}
          align="end"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          trigger={
            <IconButton label={`Move ${channel.name}`} size="sm">
              <DotsThree size={16} weight="bold" />
            </IconButton>
          }
        >
          <MoveMenu
            channel={channel}
            collections={props.collections}
            onMove={(id) => {
              setMenuOpen(false)
              props.onMove(id)
            }}
            onNew={() => {
              setMenuOpen(false)
              props.onNew()
            }}
          />
        </Popover>
      </span>
    </Card>
  )
}

export function AllChannels(props: {
  channels: Subscription[]
  collections: Collection[]
  count?: (channel: Subscription) => ReactNode
  onOpen: (channel: Subscription) => void
  onMove: (channel: Subscription, collectionId: string | null) => void
  onReorder: (ids: string[]) => void
  onCreate: (name: string, color: string) => Promise<Collection | undefined>
  onUpdate: (collection: Collection, name: string, color: string) => void
  onRemove: (collection: Collection) => void
}): JSX.Element {
  const { channels, collections } = props
  const board = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag>()
  const dragRef = useRef<Drag>()
  dragRef.current = drag
  const [holding, setHolding] = useState<string>()
  // The order while a collection is carried, before it is let go.
  const [order, setOrder] = useState<string[]>()
  const orderRef = useRef<string[]>()
  // A channel dropped on "New collection", waiting for a name.
  const [pending, setPending] = useState<Subscription>()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string>()
  // A click straight after a drag is the drop, not a click.
  const dropped = useRef(0)

  const known = new Set(collections.map((c) => c.id))
  const ordered = order
    ? order
        .map((id) => collections.find((c) => c.id == id))
        .filter((c): c is Collection => !!c)
    : collections
  const unsorted = channels.filter(
    (s) => !s.collectionId || !known.has(s.collectionId)
  )
  const nextColor =
    COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length]

  const layoutKey = [
    ordered.map((c) => c.id).join(','),
    channels.map((s) => `${s.id}:${s.collectionId ?? ''}`).join(','),
    drag?.kind ?? '',
  ].join('|')
  const flipFrom = useFlip(board, layoutKey)

  const channelById = (id: string) => channels.find((s) => s.id == id)

  const startNew = (channel?: Subscription) => {
    setPending(channel)
    setCreating(true)
  }

  // Moving a collection one place, from its menu or the arrow keys.
  const nudge = (collection: Collection, by: number) => {
    const ids = collections.map((c) => c.id)
    const from = ids.indexOf(collection.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= ids.length) return
    ids.splice(from, 1)
    ids.splice(to, 0, collection.id)
    props.onReorder(ids)
  }

  // Which collection, or "none" or "new", is under the pointer.
  const targetAt = (x: number, y: number) => {
    const hit = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>('[data-drop]')
    return hit?.dataset.drop
  }

  // While a collection is carried, the others make room for it.
  const reorderAt = (id: string, y: number) => {
    const root = board.current
    if (!root) return
    // Layout positions, not on-screen ones, so headings still sliding into
    // place don't make the order flicker.
    const top = root.getBoundingClientRect().top
    const others = Array.from(
      root.querySelectorAll<HTMLElement>('[data-collection]')
    ).filter((el) => el.dataset.collection != id)
    let index = others.length
    for (let i = 0; i < others.length; i++) {
      const el = others[i]
      if (y < top + el.offsetTop + el.offsetHeight / 2) {
        index = i
        break
      }
    }
    const ids = others.map((el) => el.dataset.collection as string)
    ids.splice(index, 0, id)
    if (orderRef.current?.join() != ids.join()) {
      orderRef.current = ids
      setOrder(ids)
    }
  }

  const move = (x: number, y: number) => {
    const current = dragRef.current
    if (!current) return
    const next = { ...current, x, y }
    if (current.kind == 'channel') {
      next.over = targetAt(x, y)
    } else {
      reorderAt(current.id, y)
    }
    dragRef.current = next
    setDrag(next)
  }

  const finish = (cancelled: boolean) => {
    const current = dragRef.current
    dragRef.current = undefined
    setDrag(undefined)
    if (!current) return
    dropped.current = Date.now()
    if (current.kind == 'collection') {
      const ids = orderRef.current
      orderRef.current = undefined
      setOrder(undefined)
      if (
        !cancelled &&
        ids &&
        ids.join() != collections.map((c) => c.id).join()
      ) {
        props.onReorder(ids)
      }
      return
    }
    const channel = channelById(current.id)
    const over = cancelled ? undefined : current.over
    if (!channel || !over) return
    if (over == NEW) {
      startNew(channel)
      return
    }
    const to = over == NONE ? null : over
    const now =
      channel.collectionId && known.has(channel.collectionId)
        ? channel.collectionId
        : null
    if (to == now) return
    // The card settles from where it was let go.
    flipFrom.current.set(
      `channel-${channel.id}`,
      new DOMRect(
        current.x - current.dx + window.scrollX,
        current.y - current.dy + window.scrollY,
        current.width,
        current.height
      )
    )
    props.onMove(channel, to)
  }
  // The listeners below are added once per drag, so they call the latest
  // copies of these.
  const moveRef = useRef(move)
  moveRef.current = move
  const finishRef = useRef(finish)
  finishRef.current = finish

  // Keeps the page from scrolling under a carried card. Added up front, not
  // when the drag starts, so iPhone never begins a scroll in between.
  useEffect(() => {
    const block = (event: TouchEvent) => {
      if (dragRef.current) event.preventDefault()
    }
    window.addEventListener('touchmove', block, { passive: false })
    return () => window.removeEventListener('touchmove', block)
  }, [])

  // Follows the pointer or finger once something is lifted, scrolls the page
  // near its edges, and lets go on release. Escape puts it back.
  useEffect(() => {
    if (!drag) return
    let frame = 0
    let lastY = drag.y
    let lastX = drag.x
    const scroll = () => {
      const speed =
        lastY < EDGE
          ? -Math.ceil((EDGE - lastY) / 6)
          : lastY > window.innerHeight - EDGE
          ? Math.ceil((lastY - (window.innerHeight - EDGE)) / 6)
          : 0
      if (speed) {
        window.scrollBy(0, speed)
        moveRef.current(lastX, lastY)
      }
      frame = requestAnimationFrame(scroll)
    }
    frame = requestAnimationFrame(scroll)
    const onPointerMove = (event: PointerEvent) => {
      lastX = event.clientX
      lastY = event.clientY
      moveRef.current(lastX, lastY)
    }
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      lastX = touch.clientX
      lastY = touch.clientY
      moveRef.current(lastX, lastY)
    }
    const onUp = () => finishRef.current(false)
    const onCancel = () => finishRef.current(true)
    const onKey = (event: KeyboardEvent) => {
      if (event.key == 'Escape') finishRef.current(true)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('touchend', onUp)
    window.addEventListener('touchcancel', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onCancel)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onUp)
      window.removeEventListener('touchcancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onCancel)
    }
    // Only when a drag starts or ends, not on every move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag])

  // A press on a card or a heading's handle. The mouse lifts it once it
  // moves a few pixels; a finger lifts it after resting a moment.
  const press = (
    kind: Drag['kind'],
    id: string,
    event: React.PointerEvent | React.TouchEvent
  ) => {
    const target = event.target as HTMLElement
    if (kind == 'channel' && target.closest('[data-more]')) return
    if ('button' in event && event.button != 0) return
    const element = (event.currentTarget as HTMLElement).closest<HTMLElement>(
      kind == 'channel' ? '[data-card]' : '[data-collection]'
    )
    if (!element) return
    const touch = 'touches' in event ? event.touches[0] : undefined
    const startX = touch ? touch.clientX : (event as React.PointerEvent).clientX
    const startY = touch ? touch.clientY : (event as React.PointerEvent).clientY
    const begin = (x: number, y: number) => {
      const rect = (
        kind == 'collection'
          ? element.querySelector<HTMLElement>('[data-heading]') ?? element
          : element
      ).getBoundingClientRect()
      const next: Drag = {
        kind,
        id,
        x,
        y,
        dx: startX - rect.left,
        dy: startY - rect.top,
        width: rect.width,
        height: kind == 'collection' ? 44 : rect.height,
      }
      dragRef.current = next
      setDrag(next)
      if (kind == 'collection') {
        orderRef.current = collections.map((c) => c.id)
        setOrder(orderRef.current)
      }
      try {
        navigator.vibrate?.(8)
      } catch {
        // Not every browser can buzz.
      }
    }

    if (!touch) {
      // A handle lifts straight away; a card waits to see if it is a click.
      if (kind == 'collection') {
        event.preventDefault()
        begin(startX, startY)
        return
      }
      const onMove = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > DRAG_SLOP) {
          cleanup()
          begin(e.clientX, e.clientY)
        }
      }
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', cleanup)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', cleanup)
      return
    }

    // A handle is meant for dragging, so a finger lifts it at once.
    let x = startX
    let y = startY
    const timer = setTimeout(
      () => {
        cleanup()
        setHolding(undefined)
        begin(x, y)
      },
      kind == 'collection' ? 0 : HOLD_MS
    )
    if (kind == 'channel') setHolding(id)
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      x = t.clientX
      y = t.clientY
      if (Math.hypot(x - startX, y - startY) > HOLD_SLOP) {
        clearTimeout(timer)
        cleanup()
        setHolding(undefined)
      }
    }
    const cleanup = () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', cancel)
      window.removeEventListener('touchcancel', cancel)
    }
    const cancel = () => {
      clearTimeout(timer)
      cleanup()
      setHolding(undefined)
    }
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', cancel)
    window.addEventListener('touchcancel', cancel)
  }

  const open = (channel: Subscription) => {
    if (Date.now() - dropped.current < 300) return
    props.onOpen(channel)
  }

  const cardFor = (channel: Subscription) => (
    <ChannelCard
      key={channel.id}
      channel={channel}
      collections={collections}
      lifted={drag?.kind == 'channel' && drag.id == channel.id}
      holding={holding == channel.id}
      count={props.count?.(channel)}
      onPress={(event) => press('channel', channel.id, event)}
      onOpen={() => open(channel)}
      onMove={(id) => props.onMove(channel, id)}
      onNew={() => startNew(channel)}
    />
  )

  const carried = drag?.kind == 'channel' ? channelById(drag.id) : undefined
  const carriedCollection =
    drag?.kind == 'collection'
      ? collections.find((c) => c.id == drag.id)
      : undefined
  const folded = drag?.kind == 'collection'
  const over = drag?.kind == 'channel' ? drag.over : undefined
  const homeOf = (channel?: Subscription) =>
    channel?.collectionId && known.has(channel.collectionId)
      ? channel.collectionId
      : NONE
  // Its own collection does not light up: dropping there changes nothing.
  const isOver = (target: string) =>
    over == target && (target == NEW || homeOf(carried) != target)

  return (
    <>
      <Intro>
        <span data-mouse="">
          Drag a channel onto a collection to file it there. Drag a collection
          by its handle to change the order.
        </span>
        <span data-touch="">
          Press and hold a channel, then drag it to a collection. Or tap ⋯ to
          choose one.
        </span>
      </Intro>
      <Board
        ref={board}
        data-dragging={!!drag}
        data-folded={folded}
        aria-label="Channels by collection"
      >
        {ordered.map((collection, index) => {
          const members = channels.filter(
            (s) => s.collectionId == collection.id
          )
          return (
            <Section
              key={collection.id}
              data-flip={`collection-${collection.id}`}
              data-collection={collection.id}
              data-drop={collection.id}
              data-over={isOver(collection.id)}
              data-lifted={carriedCollection?.id == collection.id}
              aria-label={collection.name}
            >
              <Heading data-heading="">
                <Handle
                  aria-label={`Move ${collection.name} up or down`}
                  title="Drag to reorder, or use the arrow keys"
                  onPointerDown={(event) => {
                    if (event.pointerType != 'touch') {
                      press('collection', collection.id, event)
                    }
                  }}
                  onTouchStart={(event) =>
                    press('collection', collection.id, event)
                  }
                  onKeyDown={(event) => {
                    if (event.key == 'ArrowUp') {
                      event.preventDefault()
                      nudge(collection, -1)
                    } else if (event.key == 'ArrowDown') {
                      event.preventDefault()
                      nudge(collection, 1)
                    }
                  }}
                >
                  <DotsSixVertical size={14} weight="bold" />
                </Handle>
                <CollectionDot css={{ background: collection.color }} />
                <span data-name="">{collection.name}</span>
                <span>{members.length}</span>
                <span data-hint="">Drop to move here</span>
                <span style={{ flex: 1 }} />
                <Popover
                  label={`Edit ${collection.name}`}
                  align="end"
                  open={editing == collection.id}
                  onOpenChange={(open) =>
                    setEditing(open ? collection.id : undefined)
                  }
                  trigger={
                    <IconButton label={`Edit ${collection.name}`} size="sm">
                      <DotsThree size={16} weight="bold" />
                    </IconButton>
                  }
                >
                  <MenuList
                    css={{ margin: '-4px -4px 8px', minWidth: 0 }}
                    aria-label="Order"
                  >
                    <button
                      disabled={index == 0}
                      onClick={() => nudge(collection, -1)}
                    >
                      <ArrowUp size={13} />
                      Move up
                    </button>
                    <button
                      disabled={index == ordered.length - 1}
                      onClick={() => nudge(collection, 1)}
                    >
                      <ArrowDown size={13} />
                      Move down
                    </button>
                    <hr />
                  </MenuList>
                  <CollectionForm
                    collection={collection}
                    nextColor={nextColor}
                    onSave={(name, color) => {
                      setEditing(undefined)
                      props.onUpdate(collection, name, color)
                    }}
                    onRemove={() => {
                      setEditing(undefined)
                      props.onRemove(collection)
                    }}
                  />
                </Popover>
              </Heading>
              <Grid>
                {members.length ? (
                  members.map(cardFor)
                ) : (
                  <Empty>Drag channels here</Empty>
                )}
              </Grid>
            </Section>
          )
        })}

        {(unsorted.length > 0 || drag?.kind == 'channel') && (
          <Section
            data-drop={NONE}
            data-over={isOver(NONE)}
            aria-label="Not in a collection"
          >
            <Heading>
              <span data-name="">Not in a collection</span>
              <span>{unsorted.length}</span>
              <span data-hint="">Drop to take it out</span>
            </Heading>
            <Grid>
              {unsorted.length ? (
                unsorted.map(cardFor)
              ) : (
                <Empty>Drop here to take a channel out of its collection</Empty>
              )}
            </Grid>
          </Section>
        )}

        <Popover
          label="New collection"
          align="start"
          side="top"
          open={creating}
          onOpenChange={(open) => {
            setCreating(open)
            if (!open) setPending(undefined)
          }}
          trigger={
            <NewZone data-drop={NEW} data-over={isOver(NEW)}>
              <Plus size={13} weight="bold" />
              {over == NEW && carried
                ? `New collection for ${carried.name}`
                : 'New collection'}
            </NewZone>
          }
        >
          <CollectionForm
            key={pending?.id ?? 'new'}
            nextColor={nextColor}
            onSave={async (name, color) => {
              const channel = pending
              setCreating(false)
              setPending(undefined)
              const created = await props.onCreate(name, color)
              if (created && channel) props.onMove(channel, created.id)
            }}
          />
        </Popover>
      </Board>

      {drag && (carried || carriedCollection) && (
        <Ghost
          aria-hidden="true"
          style={
            {
              width: drag.width,
              transform: `translate(${drag.x - drag.dx}px, ${
                drag.y - drag.dy
              }px)`,
            } as CSSProperties
          }
        >
          {carried ? (
            <Card as="div">
              <SiteIcon
                src={carried.icon}
                name={carried.name}
                size={32}
                round
              />
              <span data-name="">{carried.name}</span>
            </Card>
          ) : carriedCollection ? (
            <GhostHeading>
              <DotsSixVertical size={14} weight="bold" />
              <CollectionDot css={{ background: carriedCollection.color }} />
              {carriedCollection.name}
            </GhostHeading>
          ) : null}
        </Ghost>
      )}
    </>
  )
}
