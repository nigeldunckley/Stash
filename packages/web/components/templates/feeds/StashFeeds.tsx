import {
  Archive,
  ArrowSquareOut,
  ArrowUp,
  Bookmark,
  CaretDown,
  Checks,
  GearSix,
  Play,
  Plus,
  Rows,
  Rss,
  SidebarSimple,
  SquaresFour,
} from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { State } from '../../../lib/networking/fragments/articleFragment'
import {
  BulkAction,
  LibraryItemNode,
  useBulkActions,
  useGetLibraryItems,
} from '../../../lib/networking/library_items/useLibraryItems'
import { Subscription } from '../../../lib/networking/queries/useGetSubscriptionsQuery'
import {
  markItemsSeen,
  moveItemToFolder,
  searchValue,
  setItemArchived,
  subscriptionKey,
  subscriptionName,
} from '../../../lib/networking/subscriptions/feeds'
import { useGetSubscriptions } from '../../../lib/networking/subscriptions/useGetSubscriptions'
import { useGetViewer } from '../../../lib/networking/viewer/useGetViewer'
import { faviconFor, shortTimeAgo, siteName } from '../../../lib/textFormatting'
import { showErrorToast, showSuccessToast } from '../../../lib/toastHelpers'
import {
  IconButton,
  ItemList,
  ItemRow,
  PageMeta,
  Popover,
  SegmentedControl,
  showUndoToast,
  SiteIcon,
  SwipeAction,
  UnseenDot,
} from '../../elements/stash'
import { ease, motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import {
  dayGroup,
  descriptionWithoutChapters,
  isYouTubeFeedUrl,
} from '../../../lib/youtube'
import { AddChannelPanel } from './AddChannelPanel'
import { AddFeedPanel } from './AddFeedPanel'
import { VideoCard, VideoGrid, VideoGroup, VideoGroups } from './VideoCard'
import {
  FeedPeekPane,
  FeedPeekSheet,
  LIST_MIN,
  PEEK_INLINE,
  PEEK_MIN,
  PEEK_WIDTH,
} from './FeedPeek'
import { SourceSettings } from './SourceSettings'

const Page = styled('main', {
  width: '100%',
  minHeight: '100vh',
  boxSizing: 'border-box',
  color: '$stInk',
  fontFamily: '$inter',
  padding: '24px 32px 80px',
  '@mdDown': { padding: '16px 16px 32px' },
})

const Panes = styled('div', {
  maxWidth: '1180px',
  margin: '0 auto',
  display: 'grid',
  gridTemplateColumns: '240px minmax(0, 1fr)',
  gap: '28px',
  alignItems: 'start',
  '@mdDown': { gridTemplateColumns: 'minmax(0, 1fr)' },
  variants: {
    // With the peek open, sources fold into a rail of icons.
    peeking: {
      true: {
        gridTemplateColumns: '36px minmax(0, 1fr)',
        gap: '20px',
      },
    },
    // On wide screens the peek is a third column rather than floating.
    inline: {
      true: {
        maxWidth: '1680px',
        // The stored width gives way when the window is too narrow for it, so
        // the list keeps at least LIST_MIN.
        gridTemplateColumns: `36px minmax(0, 1fr) max(${PEEK_MIN}px, min(var(--peek-width, ${PEEK_WIDTH}px), calc(100% - ${
          36 + 40 + LIST_MIN
        }px)))`,
      },
    },
  },
})

const Sources = styled('nav', {
  position: 'sticky',
  top: '24px',
  display: 'grid',
  gap: '2px',
  maxHeight: 'calc(100vh - 48px)',
  overflowY: 'auto',
  '@mdDown': { display: 'none' },
})

// The collapsed sources column: icons only, with a dot for unseen items.
const rail = {
  width: '36px',
  overflow: 'hidden',
  '& > div:first-child': { display: 'none' },
  '& > button': {
    gridTemplateColumns: '1fr',
    justifyItems: 'center',
    position: 'relative',
    padding: 0,
  },
  '& > button > span:nth-child(2)': { display: 'none' },
  '& > button > span:nth-child(3)': {
    position: 'absolute',
    top: '6px',
    right: '5px',
    width: '5px',
    height: '5px',
    padding: 0,
    borderRadius: '50%',
    fontSize: 0,
  },
  '& > button > span:nth-child(3):not(:empty)': { background: '$stAccent' },
}

// Rows saved from the list fold away before they leave it.
const Leaving = styled('div', {
  display: 'grid',
  gridTemplateRows: '1fr',
  transition: `grid-template-rows 220ms ${ease}, opacity 180ms ${ease}`,
  '& > *': { minHeight: 0, overflow: 'hidden' },
  variants: {
    leaving: {
      true: { gridTemplateRows: '0fr', opacity: 0 },
    },
  },
})

const SourcesHeading = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 8px 10px',
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '$stMuted',
})

const Source = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'grid',
  gridTemplateColumns: '18px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  height: '32px',
  padding: '0 8px',
  borderRadius: '$sm',
  fontSize: '$small',
  color: '$stInk2',
  cursor: 'pointer',
  transition: `background ${motion.fast}, color ${motion.fast}`,
  '&:hover': { background: '$stSunken', color: '$stInk' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-2px' },
  '& > span:nth-child(2)': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '&[aria-current="true"]': {
    background: '$stSurface',
    color: '$stInk',
    fontWeight: 500,
    boxShadow: 'inset 0 0 0 1px $colors$stLine',
  },
})

const Count = styled('span', {
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  fontVariantNumeric: 'tabular-nums',
  variants: {
    unseen: { true: { color: '$stAccentText' } },
  },
})

const AllIcon = styled('span', {
  display: 'grid',
  placeItems: 'center',
  width: '18px',
  height: '18px',
  borderRadius: '5px',
  background: '$stAccent',
  color: '$stOnAccent',
  fontFamily: '$mono',
  fontSize: '10px',
  fontWeight: 600,
})

const LayoutToggle = styled('div', {
  display: 'flex',
  gap: '2px',
  padding: '2px',
  border: '1px solid $stLine',
  borderRadius: '$sm',
})

const Toolbar = styled('header', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
  marginBottom: '16px',
  // One line on a phone: the source name gives way to the controls.
  '@smDown': {
    gap: '6px',
    flexWrap: 'nowrap',
    '& > *': { flex: 'none' },
    '& > :first-child, & > :nth-child(2)': { flex: '0 1 auto', minWidth: 0 },
  },
})

const TitleButton = styled('button', {
  all: 'unset',
  display: 'none',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  maxWidth: '100%',
  cursor: 'pointer',
  '@mdDown': { display: 'inline-flex' },
})

const TextButton = styled('button', {
  all: 'unset',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '28px',
  padding: '0 10px',
  fontSize: '$caption',
  color: '$stInk',
  border: '1px solid $stLine',
  borderRadius: '$sm',
  background: '$stSurface',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
  '&:disabled': { opacity: 0.5, cursor: 'default' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
})

const Wide = styled('span', {
  '@smDown': { display: 'none' },
})

// Floats over the top of the list when the server has items the list
// doesn't show yet.
const NewItemsBar = styled('div', {
  position: 'sticky',
  // The pill sits on the list's top edge, and 12px below the top once stuck.
  top: '27px',
  // Below the navigation bar on iPhone.
  '@mdDown': { top: 'calc(60px + env(safe-area-inset-top, 0px))' },
  zIndex: 3,
  display: 'flex',
  justifyContent: 'center',
  height: 0,
  overflow: 'visible',
  button: {
    all: 'unset',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: '30px',
    marginTop: '-15px',
    padding: '0 12px',
    borderRadius: '999px',
    background: '$stInk',
    color: '$stCanvas',
    fontFamily: '$inter',
    fontSize: '$caption',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.18)',
    transition: `transform ${motion.fast}`,
    '&:hover': { transform: 'translateY(-1px)' },
    '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  },
})

// How often the open list and the counts look for new items (ms).
const LIVE_CHECK = 60 * 1000

const Empty = styled('div', {
  padding: '40px 16px',
  textAlign: 'center',
  fontSize: '$small',
  lineHeight: 1.5,
  color: '$stMuted',
  background: '$stSurface',
  border: '1px dashed $stLine',
  borderRadius: '$md',
})

// The source at the start of a row's subtitle, with its favicon.
const RowSource = styled('span', {
  '& > span:first-child': { verticalAlign: '-3px', marginRight: '6px' },
})

const MobileSources = styled('div', {
  display: 'grid',
  gap: '2px',
  minWidth: '240px',
  maxHeight: '60vh',
  overflowY: 'auto',
})

type View = 'unseen' | 'all'

const PEEK_WIDTH_KEY = 'feeds-peek-width'
const LAYOUT_KEY = 'feeds-watch-layout'

function useMediaQuery(query: string): boolean {
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

// The full publish date, for the tooltip on a row's age.
const publishedLabel = (item: LibraryItemNode) => {
  const date = item.publishedAt || item.savedAt
  return date ? new Date(date).toLocaleString() : undefined
}

const isVisible = (item: LibraryItemNode) =>
  item.state !== State.ARCHIVED && item.state !== State.DELETED

const byName = (a: Subscription, b: Subscription) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

// Read holds articles and Watch holds videos, from YouTube channels or
// anywhere else.
type Tab = 'read' | 'watch'

const tabQuery = (tab: Tab) => (tab == 'watch' ? 'type:video' : '-type:video')

const sourceQuery = (tab: Tab, subscription?: Subscription) =>
  [
    subscription
      ? `subscription:${searchValue(subscriptionKey(subscription))}`
      : '',
    tabQuery(tab),
  ]
    .filter(Boolean)
    .join(' ')

const isChannel = (subscription: Subscription) =>
  isYouTubeFeedUrl(subscription.url)

// The unseen count for one source, shown in the sources list.
function useUnseenCount(tab: Tab, subscription?: Subscription) {
  const query = useGetLibraryItems(
    `feeds-count-${subscription?.id ?? `all-${tab}`}`,
    'following',
    {
      limit: 1,
      sortDescending: true,
      searchQuery: `${sourceQuery(tab, subscription)} -is:seen`,
      includeCount: true,
    },
    true,
    LIVE_CHECK * 2
  )
  return query.data?.pages[0]?.pageInfo.totalCount
}

function SourceCount(props: {
  tab: Tab
  subscription?: Subscription
}): JSX.Element {
  const count = useUnseenCount(props.tab, props.subscription)
  if (!count) {
    return <Count />
  }
  return <Count unseen>{count > 999 ? '999+' : count}</Count>
}

// Read and Watch, as the page's title. Each shows its unseen count.
const Tabs = styled('div', {
  display: 'flex',
  alignItems: 'baseline',
  gap: '22px',
  maxWidth: '1180px',
  margin: '0 auto 18px',
  '@mdDown': { gap: '18px', marginBottom: '12px' },
  variants: {
    wide: { true: { maxWidth: '1680px' } },
  },
})

const TabButton = styled('button', {
  all: 'unset',
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '5px',
  cursor: 'pointer',
  fontFamily: '$inter',
  fontSize: '26px',
  fontWeight: 600,
  lineHeight: 1.15,
  letterSpacing: '-0.028em',
  color: '$stMuted',
  transition: `color ${motion.fast}`,
  '&:hover': { color: '$stInk2' },
  '&[aria-selected="true"]': { color: '$stInk' },
  '&:focus-visible': {
    outline: '2px solid $stAccent',
    outlineOffset: '3px',
    borderRadius: '4px',
  },
  '& > sup': {
    position: 'relative',
    top: '-0.55em',
    fontFamily: '$mono',
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: 0,
    color: '$stMuted',
    fontVariantNumeric: 'tabular-nums',
  },
  '& > sup[data-unseen="true"]': { color: '$stAccentText' },
  '@mdDown': { fontSize: '30px' },
})

function TabLabel(props: {
  tab: Tab
  label: string
  current: Tab
  onSelect: (tab: Tab) => void
}): JSX.Element {
  const count = useUnseenCount(props.tab)
  return (
    <TabButton
      role="tab"
      aria-selected={props.current == props.tab}
      onClick={() => props.onSelect(props.tab)}
    >
      {props.label}
      {count ? (
        <sup data-unseen="true">{count > 999 ? '999+' : count}</sup>
      ) : null}
    </TabButton>
  )
}

// The source's name above the list, smaller than the tabs.
const ListTitle = styled('h1', {
  margin: 0,
  fontFamily: '$inter',
  fontSize: '$ui',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: '$stInk',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
})

function SourceList(props: {
  tab: Tab
  subscriptions: Subscription[]
  selected?: Subscription
  onSelect: (subscription?: Subscription) => void
}): JSX.Element {
  const all = props.tab == 'watch' ? 'All channels' : 'All feeds'
  return (
    <>
      <Source
        aria-current={!props.selected}
        onClick={() => props.onSelect(undefined)}
        title={all}
      >
        <AllIcon aria-hidden="true">
          {props.tab == 'watch' ? (
            <Play size={10} weight="fill" />
          ) : (
            <Rss size={11} weight="bold" />
          )}
        </AllIcon>
        <span>{all}</span>
        <SourceCount tab={props.tab} />
      </Source>
      {props.subscriptions.map((subscription) => (
        <Source
          key={subscription.id}
          aria-current={props.selected?.id == subscription.id}
          onClick={() => props.onSelect(subscription)}
          title={subscription.name}
        >
          <SiteIcon
            src={subscription.icon}
            fallbackSrc={
              props.tab == 'watch' ? undefined : faviconFor(subscription.url)
            }
            name={subscription.name}
            size={18}
            round={props.tab == 'watch'}
          />
          <span>{subscription.name}</span>
          <SourceCount tab={props.tab} subscription={subscription} />
        </Source>
      ))}
    </>
  )
}

// Feeds as two panes: sources on the left with unseen counts, items on the
// right. Items count as seen when opened or scrolled past, and only enter the
// Library when saved.
export function StashFeeds(): JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: viewer } = useGetViewer()
  const bulkAction = useBulkActions()
  const { data: allSubscriptions, isPending: subscriptionsPending } =
    useGetSubscriptions({})

  const tab: Tab = router.query.tab == 'watch' ? 'watch' : 'read'

  // The tab's sources: YouTube channels in Watch, every other feed in Read.
  const subscriptions = useMemo(
    () =>
      (allSubscriptions ?? [])
        .filter(
          (subscription) =>
            subscription.status == 'ACTIVE' &&
            isChannel(subscription) == (tab == 'watch')
        )
        .sort(byName),
    [allSubscriptions, tab]
  )
  const selectedId =
    typeof router.query.source == 'string' ? router.query.source : undefined
  const selected = subscriptions.find((s) => s.id == selectedId)

  const [view, setView] = useState<View>('unseen')
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const isPhone = useMediaQuery('(max-width: 768px)')
  const peekInline = useMediaQuery(PEEK_INLINE)

  // The item open in the peek. A copy is kept so the peek stays put even if
  // the list refreshes underneath it.
  const [peekItem, setPeekItem] = useState<LibraryItemNode>()
  // Items saved to the Library this visit. They leave the list, except the
  // one still open in the peek.
  const [saved, setSaved] = useState<Set<string>>(new Set())
  // Items archived this visit. They leave the list straight away.
  const [archived, setArchived] = useState<Set<string>>(new Set())
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const [focusId, setFocusId] = useState<string | undefined>()

  // The peek pane's width, dragged by its edge and kept between visits.
  const [peekWidth, setPeekWidth] = useState<number>()
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(PEEK_WIDTH_KEY))
      if (stored > 0) setPeekWidth(stored)
    } catch {
      // Storage is unavailable; use the default width.
    }
  }, [])
  const resizePeek = useCallback((width: number | undefined) => {
    setPeekWidth(width)
    try {
      if (width) {
        window.localStorage.setItem(PEEK_WIDTH_KEY, String(width))
      } else {
        window.localStorage.removeItem(PEEK_WIDTH_KEY)
      }
    } catch {
      // Storage is unavailable; the width lasts until the page closes.
    }
  }, [])

  // Re-render each minute so "5 mins ago" stays true.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  // Watch shows videos as a grid of cards or as rows, kept between visits.
  const [layout, setLayout] = useState<'grid' | 'rows'>('grid')
  useEffect(() => {
    try {
      if (window.localStorage.getItem(LAYOUT_KEY) == 'rows') setLayout('rows')
    } catch {
      // Storage is unavailable; use the grid.
    }
  }, [])
  const changeLayout = (next: 'grid' | 'rows') => {
    setLayout(next)
    try {
      window.localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // Storage is unavailable; the choice lasts until the page closes.
    }
  }

  const select = useCallback(
    (subscription?: Subscription) => {
      const query = { ...router.query }
      if (subscription) {
        query.source = subscription.id
      } else {
        delete query.source
      }
      router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      })
      setSourcesOpen(false)
      setPeekItem(undefined)
      window.scrollTo({ top: 0 })
    },
    [router]
  )

  const setTab = useCallback(
    (next: Tab) => {
      if (next == tab) return
      const query = { ...router.query }
      delete query.source
      if (next == 'watch') {
        query.tab = 'watch'
      } else {
        delete query.tab
      }
      router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      })
      setSourcesOpen(false)
      setPeekItem(undefined)
      setSeen(new Set())
      window.scrollTo({ top: 0 })
    },
    [router, tab]
  )

  const searchQuery = [
    sourceQuery(tab, selected),
    view == 'unseen' ? '-is:seen' : '',
    'sort:published-desc',
  ]
    .filter(Boolean)
    .join(' ')
  const itemsQuery = useGetLibraryItems(
    `feeds-${selected?.id ?? `all-${tab}`}-${view}`,
    'following',
    { limit: 20, sortDescending: true, searchQuery, includeCount: true }
  )
  const items = useMemo(
    () =>
      (itemsQuery.data?.pages ?? [])
        .flatMap((page) => page.edges)
        .map((edge) => edge.node)
        .filter(isVisible),
    [itemsQuery.data]
  )
  const listed = useMemo(
    () =>
      items.filter(
        (item) =>
          leaving.has(item.id) ||
          item.id == peekItem?.id ||
          (!archived.has(item.id) && !saved.has(item.id))
      ),
    [items, saved, archived, leaving, peekItem]
  )
  const total = itemsQuery.data?.pages[0]?.pageInfo.totalCount

  // Refetching the open list would pull rows out from under the reader, so a
  // one-item query watches for newer items and offers to show them. It looks
  // at the most recently changed unseen item rather than the newest by
  // publish date, so items that arrive with an older date are noticed too.
  const latestQuery = useGetLibraryItems(
    `feeds-latest-${selected?.id ?? `all-${tab}`}`,
    'following',
    {
      limit: 1,
      sortDescending: true,
      searchQuery: `${sourceQuery(tab, selected)} -is:seen sort:updated-desc`,
    },
    true,
    LIVE_CHECK
  )
  const latestId = latestQuery.data?.pages[0]?.edges[0]?.node.id
  const listedIds = useMemo(
    () =>
      new Set(
        (itemsQuery.data?.pages ?? []).flatMap((page) =>
          page.edges.map((edge) => edge.node.id)
        )
      ),
    [itemsQuery.data]
  )
  // What the watcher saw when the list last loaded. A different item since
  // then means something arrived or changed.
  const [baselineId, setBaselineId] = useState<string>()
  const latestRef = useRef(latestId)
  latestRef.current = latestId
  useEffect(() => {
    setBaselineId(latestRef.current)
  }, [itemsQuery.dataUpdatedAt])
  useEffect(() => {
    if (latestId) {
      setBaselineId((current) => current ?? latestId)
    }
  }, [latestId])
  const hasNewItems =
    !!latestId &&
    latestId != baselineId &&
    !itemsQuery.isFetching &&
    !itemsQuery.isPending &&
    !listedIds.has(latestId)

  // Seen state is kept locally so rows stay put while they are being read.
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const pending = useRef(new Set<string>())
  const flushTimer = useRef<ReturnType<typeof setTimeout>>()

  const flush = useCallback(async () => {
    const ids = Array.from(pending.current)
    pending.current.clear()
    if (!ids.length) {
      return
    }
    try {
      await markItemsSeen(ids)
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] == 'libraryItems' &&
          typeof query.queryKey[1] == 'string' &&
          (query.queryKey[1].startsWith('feeds-count-') ||
            query.queryKey[1] == 'home-feeds'),
      })
    } catch (error) {
      console.log('error marking items seen', error)
    }
  }, [queryClient])

  const markSeen = useCallback(
    (ids: string[], immediately = false) => {
      const fresh = ids.filter((id) => !seen.has(id))
      if (!fresh.length) {
        return
      }
      setSeen((current) => {
        const next = new Set(current)
        fresh.forEach((id) => next.add(id))
        return next
      })
      fresh.forEach((id) => pending.current.add(id))
      clearTimeout(flushTimer.current)
      if (immediately) {
        flush()
      } else {
        flushTimer.current = setTimeout(flush, 1500)
      }
    },
    [seen, flush]
  )

  useEffect(() => {
    return () => {
      clearTimeout(flushTimer.current)
      flush()
    }
  }, [flush])

  const showNewItems = useCallback(async () => {
    clearTimeout(flushTimer.current)
    await flush()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    await itemsQuery.refetch()
  }, [flush, itemsQuery])

  // With nothing on screen, or the reader at the top of the list with
  // nothing open, there is nothing to disturb, so just show them.
  useEffect(() => {
    if (!hasNewItems) {
      return
    }
    if (items.length == 0) {
      itemsQuery.refetch()
    } else if (!peekItem && window.scrollY < 40) {
      clearTimeout(flushTimer.current)
      flush().then(() => itemsQuery.refetch())
    }
  }, [hasNewItems, items.length, itemsQuery, peekItem, flush])

  const isSeen = useCallback(
    (item: LibraryItemNode) => !!item.seenAt || seen.has(item.id),
    [seen]
  )

  // Rows that scroll off the top of the screen count as seen.
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const observer = useRef<IntersectionObserver>()
  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        const passed = entries
          .filter(
            (entry) =>
              !entry.isIntersecting && entry.boundingClientRect.bottom < 0
          )
          .map((entry) => (entry.target as HTMLElement).dataset.itemId)
          .filter((id): id is string => !!id)
        if (passed.length) {
          markSeen(passed)
        }
      },
      { threshold: 0 }
    )
    rowRefs.current.forEach((element) => observer.current?.observe(element))
    return () => observer.current?.disconnect()
  }, [markSeen])

  const rowRef = (id: string) => (element: HTMLDivElement | null) => {
    const previous = rowRefs.current.get(id)
    if (previous && previous !== element) {
      observer.current?.unobserve(previous)
    }
    if (element) {
      element.dataset.itemId = id
      rowRefs.current.set(id, element)
      observer.current?.observe(element)
    } else {
      rowRefs.current.delete(id)
    }
  }

  // Load more as the end of the list comes into view.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = itemsQuery
  useEffect(() => {
    const element = sentinel.current
    if (!element || !hasNextPage) {
      return
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          !isFetchingNextPage
        ) {
          fetchNextPage()
        }
      },
      { rootMargin: '400px' }
    )
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const open = useCallback(
    (item: LibraryItemNode) => {
      const username = viewer?.profile.username
      if (!username) {
        return
      }
      markSeen([item.id], true)
      window.localStorage.setItem('nav-return', router.asPath)
      router.push(`/${username}/${item.slug}`)
    },
    [router, viewer, markSeen]
  )

  // The Library, Home and the source counts need to hear about saves; the
  // feed list keeps its own state.
  const refreshElsewhere = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] == 'libraryItems' &&
        typeof query.queryKey[1] == 'string' &&
        (!query.queryKey[1].startsWith('feeds-') ||
          query.queryKey[1].startsWith('feeds-count-')),
    })
  }, [queryClient])

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set)
    if (on) {
      next.add(id)
    } else {
      next.delete(id)
    }
    return next
  }

  // A row that was saved or archived stays in the list while it folds away.
  const fold = (id: string) => {
    setLeaving((current) => toggle(current, id, true))
    setTimeout(() => setLeaving((current) => toggle(current, id, false)), 220)
  }

  const save = useCallback(
    async (item: LibraryItemNode) => {
      if (saved.has(item.id)) {
        return
      }
      markSeen([item.id])
      if (item.id == peekItem?.id) {
        setSaved((current) => toggle(current, item.id, true))
      } else {
        setSaved((current) => toggle(current, item.id, true))
        fold(item.id)
      }
      try {
        await moveItemToFolder(item.id, 'inbox')
        refreshElsewhere()
        showUndoToast('Saved to Library', async () => {
          try {
            await moveItemToFolder(item.id, 'following')
            setSaved((current) => toggle(current, item.id, false))
            refreshElsewhere()
          } catch {
            showErrorToast('Could not move it back to Feeds', {
              position: 'bottom-center',
            })
          }
        })
      } catch {
        setSaved((current) => toggle(current, item.id, false))
        setLeaving((current) => toggle(current, item.id, false))
        showErrorToast('Could not save to Library', {
          position: 'bottom-center',
        })
      }
    },
    [saved, peekItem, markSeen, refreshElsewhere]
  )

  const openPeek = useCallback(
    (item: LibraryItemNode) => {
      setPeekItem(item)
      setFocusId(item.id)
      markSeen([item.id])
      const row = rowRefs.current.get(item.id)
      row?.focus({ preventScroll: true })
      row?.scrollIntoView({ block: 'nearest' })
    },
    [markSeen]
  )

  const closePeek = useCallback(() => {
    if (peekItem) {
      rowRefs.current.get(peekItem.id)?.focus({ preventScroll: true })
    }
    setPeekItem(undefined)
  }, [peekItem])

  const peekIndex = peekItem
    ? listed.findIndex((item) => item.id == peekItem.id)
    : -1
  // A refresh can drop the peeked item from the list (it is seen, or saved).
  // Its last place keeps Next and Previous moving from where it was.
  const lastPeekIndex = useRef(0)
  if (peekIndex >= 0) {
    lastPeekIndex.current = peekIndex
  }
  const peekAnchor = peekIndex >= 0 ? peekIndex : lastPeekIndex.current
  const peekAfter = peekIndex >= 0 ? peekIndex + 1 : lastPeekIndex.current

  // Moving on from an item counts it as seen.
  const step = useCallback(
    (delta: 1 | -1) => {
      if (!peekItem) {
        return
      }
      const next = listed[delta > 0 ? peekAfter : peekAnchor - 1]
      if (next) {
        openPeek(next)
      } else if (delta > 0 && isPhone) {
        setPeekItem(undefined)
        showUndoToast('You are all caught up')
      }
    },
    [peekItem, peekAnchor, peekAfter, listed, openPeek, isPhone]
  )

  // Archiving the item in the peek moves on to the next one, as in Mail.
  const archive = useCallback(
    async (item: LibraryItemNode) => {
      if (archived.has(item.id)) {
        return
      }
      markSeen([item.id])
      if (item.id == peekItem?.id) {
        const next = listed[peekAfter] ?? listed[peekAnchor - 1]
        setArchived((current) => toggle(current, item.id, true))
        if (next && next.id != item.id) {
          openPeek(next)
        } else {
          setPeekItem(undefined)
        }
      } else {
        setArchived((current) => toggle(current, item.id, true))
        fold(item.id)
      }
      try {
        await setItemArchived(item.id, true)
        refreshElsewhere()
        showUndoToast('Archived', async () => {
          try {
            await setItemArchived(item.id, false)
            setArchived((current) => toggle(current, item.id, false))
            refreshElsewhere()
          } catch {
            showErrorToast('Could not unarchive it', {
              position: 'bottom-center',
            })
          }
        })
      } catch {
        setArchived((current) => toggle(current, item.id, false))
        setLeaving((current) => toggle(current, item.id, false))
        showErrorToast('Could not archive it', { position: 'bottom-center' })
      }
    },
    [
      archived,
      peekItem,
      peekAnchor,
      peekAfter,
      listed,
      markSeen,
      openPeek,
      refreshElsewhere,
    ]
  )

  const openOriginal = (item: LibraryItemNode) => {
    markSeen([item.id])
    window.open(item.originalArticleUrl || item.url, '_blank', 'noreferrer')
  }

  const unseenOnScreen = listed.filter((item) => !isSeen(item))
  const markAllSeen = useCallback(async () => {
    const query = `in:following use:folders ${sourceQuery(
      tab,
      selected
    )} -is:seen`
    try {
      await bulkAction.mutateAsync({
        action: BulkAction.MARK_AS_SEEN,
        query: query.replace(/\s+/g, ' ').trim(),
        expectedCount: view == 'unseen' && total ? total : items.length,
      })
      setSeen(new Set(items.map((item) => item.id)))
      showSuccessToast(
        selected
          ? `Marked ${selected.name} as seen`
          : tab == 'watch'
          ? 'Marked all videos as seen'
          : 'Marked all feeds as seen',
        { position: 'bottom-right' }
      )
    } catch {
      showErrorToast('Could not mark items as seen', {
        position: 'bottom-right',
      })
    }
  }, [bulkAction, selected, view, total, items, tab])

  // Keyboard: j and k move, space peeks, o opens in the Reader, s saves to
  // the Library, Backspace (or Delete) archives, m marks seen, v opens the
  // original page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.metaKey ||
        event.ctrlKey ||
        target.closest('input, textarea, [contenteditable="true"]') ||
        document.querySelector('[role="dialog"]')
      ) {
        return
      }
      const index = listed.findIndex((item) => item.id == focusId)
      const current = peekItem ?? (index >= 0 ? listed[index] : undefined)
      const move = (next?: LibraryItemNode) => {
        if (next) {
          setFocusId(next.id)
          rowRefs.current.get(next.id)?.focus()
        }
      }
      switch (event.key) {
        case 'j':
          event.preventDefault()
          if (peekItem) {
            step(1)
            break
          }
          if (current) markSeen([current.id])
          move(listed[Math.min(listed.length - 1, index + 1)])
          break
        case 'k':
          event.preventDefault()
          if (peekItem) {
            step(-1)
            break
          }
          move(listed[Math.max(0, index - 1)])
          break
        case ' ':
          if (target.closest('button, a')) break
          event.preventDefault()
          if (peekItem) closePeek()
          else if (current) openPeek(current)
          break
        case 'Escape':
          if (peekItem) closePeek()
          break
        case 'o':
          if (current) open(current)
          break
        case 's':
          if (current) save(current)
          break
        case 'Backspace':
        case 'Delete':
          if (target.closest('button, a, [role="separator"]')) break
          event.preventDefault()
          if (current) archive(current)
          break
        case 'm':
          if (current) markSeen([current.id], true)
          break
        case 'v':
          if (current) openOriginal(current)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const sourceName = (item: LibraryItemNode) =>
    subscriptionName(item.subscription, allSubscriptions) ||
    siteName(item.originalArticleUrl, item.url, item.siteName)

  // The feed's own icon, else the page's, else the site's /favicon.ico.
  const sourceIcon = (item: LibraryItemNode) =>
    allSubscriptions?.find(
      (subscription) =>
        subscription.url == item.subscription ||
        subscription.name == item.subscription
    )?.icon || item.siteIcon
  const sourceIconFallback = (item: LibraryItemNode) =>
    faviconFor(item.originalArticleUrl, item.url)

  const peekProps = (item: LibraryItemNode) => ({
    item,
    username: viewer?.profile.username,
    sourceName: sourceName(item),
    sourceIcon: sourceIcon(item),
    sourceIconFallback: sourceIconFallback(item),
    position: Math.min(peekAnchor + 1, listed.length),
    count: listed.length,
    saved: saved.has(item.id),
    onSave: () => save(item),
    onArchive: () => archive(item),
    onNext: () => step(1),
    onPrevious: () => step(-1),
    onClose: closePeek,
    onOpenOriginal: () => openOriginal(item),
    onRead: () => open(item),
    onResize: resizePeek,
  })

  const title =
    selected?.name ?? (tab == 'watch' ? 'All channels' : 'All feeds')
  const meta =
    total === undefined
      ? undefined
      : view == 'unseen'
      ? `${total} unseen`
      : `${total} items`

  const watching = tab == 'watch'

  const sourceList = (
    <SourceList
      tab={tab}
      subscriptions={subscriptions}
      selected={selected}
      onSelect={select}
    />
  )

  const noFeeds = !subscriptionsPending && subscriptions.length == 0

  // Watch's grid runs in day groups: Today, Yesterday, This week, then months.
  const videoGroups = useMemo(() => {
    const groups: { label: string; items: LibraryItemNode[] }[] = []
    const today = new Date(now)
    for (const item of listed) {
      const label = dayGroup(item.publishedAt || item.savedAt, today)
      const last = groups[groups.length - 1]
      if (last?.label == label) {
        last.items.push(item)
      } else {
        groups.push({ label, items: [item] })
      }
    }
    return groups
  }, [listed, now])

  const addPanel = (onDone?: () => void) =>
    watching ? (
      <AddChannelPanel onDone={onDone && (() => onDone())} />
    ) : (
      <AddFeedPanel onDone={onDone} />
    )
  const addLabel = watching ? 'Add a channel' : 'Add a feed'

  // One video as a card, for Watch's grid.
  const cardFor = (item: LibraryItemNode) => (
    <Leaving key={item.id} leaving={leaving.has(item.id)}>
      <SwipeAction
        label="Save"
        icon={<Bookmark size={16} />}
        onAction={() => save(item)}
        start={{
          label: 'Archive',
          icon: <Archive size={16} />,
          onAction: () => archive(item),
        }}
      >
        <VideoCard
          ref={rowRef(item.id)}
          item={item}
          channelName={sourceName(item)}
          channelIcon={sourceIcon(item)}
          showChannel={!selected}
          age={
            <time
              dateTime={item.publishedAt || item.savedAt}
              title={publishedLabel(item)}
            >
              {shortTimeAgo(item.publishedAt || item.savedAt, now)}
            </time>
          }
          seen={isSeen(item)}
          saved={saved.has(item.id)}
          selected={peekItem ? item.id == peekItem.id : item.id == focusId}
          onOpen={() =>
            item.id == peekItem?.id ? closePeek() : openPeek(item)
          }
          onFocus={() => setFocusId(item.id)}
          onSave={() => save(item)}
          onArchive={() => archive(item)}
          onOpenOriginal={() => openOriginal(item)}
        />
      </SwipeAction>
    </Leaving>
  )

  // One item as a row, for Read and for Watch's list view.
  const rowFor = (item: LibraryItemNode) => {
    const itemSeen = isSeen(item)
    return (
      <Leaving key={item.id} leaving={leaving.has(item.id)}>
        <SwipeAction
          label="Save"
          icon={<Bookmark size={16} />}
          onAction={() => save(item)}
          start={{
            label: 'Archive',
            icon: <Archive size={16} />,
            onAction: () => archive(item),
          }}
        >
          <ItemRow
            ref={rowRef(item.id)}
            leading={<UnseenDot hidden={itemSeen} />}
            title={item.title}
            image={item.image}
            subtitle={
              <RowSource>
                {!selected && (
                  <SiteIcon
                    src={sourceIcon(item)}
                    fallbackSrc={sourceIconFallback(item)}
                    name={sourceName(item)}
                    size={14}
                    round={watching}
                  />
                )}
                {[
                  selected ? undefined : sourceName(item),
                  item.author &&
                  item.author !=
                    subscriptionName(item.subscription, allSubscriptions)
                    ? item.author
                    : undefined,
                  saved.has(item.id) ? 'Saved' : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </RowSource>
            }
            excerpt={
              watching
                ? descriptionWithoutChapters(item.description)
                : item.description
            }
            meta={
              <time
                dateTime={item.publishedAt || item.savedAt}
                title={publishedLabel(item)}
              >
                {shortTimeAgo(item.publishedAt || item.savedAt, now)}
              </time>
            }
            muted={itemSeen}
            selected={peekItem ? item.id == peekItem.id : item.id == focusId}
            onOpen={() =>
              item.id == peekItem?.id ? closePeek() : openPeek(item)
            }
            onFocus={() => setFocusId(item.id)}
            actions={
              <>
                <IconButton
                  label={
                    saved.has(item.id) ? 'Saved to Library' : 'Save to Library'
                  }
                  shortcut="s"
                  size="sm"
                  active={saved.has(item.id)}
                  onClick={() => save(item)}
                >
                  <Bookmark
                    size={15}
                    weight={saved.has(item.id) ? 'fill' : 'regular'}
                  />
                </IconButton>
                <IconButton
                  label="Archive"
                  shortcut="⌫"
                  size="sm"
                  onClick={() => archive(item)}
                >
                  <Archive size={15} />
                </IconButton>
                <IconButton
                  label="Peek"
                  shortcut="Space"
                  size="sm"
                  active={item.id == peekItem?.id}
                  onClick={() =>
                    item.id == peekItem?.id ? closePeek() : openPeek(item)
                  }
                >
                  <SidebarSimple size={15} mirrored />
                </IconButton>
                <IconButton
                  label="Open original"
                  shortcut="v"
                  size="sm"
                  onClick={() => openOriginal(item)}
                >
                  <ArrowSquareOut size={15} />
                </IconButton>
              </>
            }
          />
        </SwipeAction>
      </Leaving>
    )
  }

  return (
    <Page>
      <Tabs role="tablist" aria-label="Feeds" wide={!!peekItem && peekInline}>
        <TabLabel tab="read" label="Read" current={tab} onSelect={setTab} />
        <TabLabel tab="watch" label="Watch" current={tab} onSelect={setTab} />
      </Tabs>
      <Panes
        peeking={!!peekItem}
        inline={!!peekItem && peekInline}
        style={
          peekWidth
            ? ({ '--peek-width': `${peekWidth}px` } as CSSProperties)
            : undefined
        }
      >
        <Sources aria-label="Sources" css={peekItem ? rail : undefined}>
          <SourcesHeading>
            {watching ? 'Channels' : 'Sources'}
            <Popover
              label={addLabel}
              align="start"
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <IconButton label={addLabel} size="sm">
                  <Plus size={14} />
                </IconButton>
              }
            >
              {addPanel(() => setAddOpen(false))}
            </Popover>
          </SourcesHeading>
          {sourceList}
        </Sources>

        <section aria-label={title}>
          <Toolbar>
            <ListTitle css={{ '@mdDown': { display: 'none' } }}>
              {title}
            </ListTitle>
            <Popover
              label="Sources"
              align="start"
              open={sourcesOpen}
              onOpenChange={setSourcesOpen}
              trigger={
                <TitleButton
                  aria-label={watching ? 'Choose a channel' : 'Choose a source'}
                >
                  <ListTitle>
                    {selected?.name ?? (watching ? 'Channels' : 'Sources')}
                  </ListTitle>
                  <CaretDown size={14} />
                </TitleButton>
              }
            >
              <MobileSources>{sourceList}</MobileSources>
            </Popover>
            {meta && (
              <PageMeta css={{ '@smDown': { display: 'none' } }}>
                {meta}
              </PageMeta>
            )}
            <span style={{ flex: 1 }} />
            {watching && (
              <LayoutToggle role="group" aria-label="Layout">
                <IconButton
                  label="Grid"
                  size="sm"
                  active={layout == 'grid'}
                  onClick={() => changeLayout('grid')}
                >
                  <SquaresFour size={15} />
                </IconButton>
                <IconButton
                  label="List"
                  size="sm"
                  active={layout == 'rows'}
                  onClick={() => changeLayout('rows')}
                >
                  <Rows size={15} />
                </IconButton>
              </LayoutToggle>
            )}
            <SegmentedControl
              label="Show"
              value={view}
              onChange={(next) => {
                setView(next)
                setSeen(new Set())
                setPeekItem(undefined)
              }}
              options={[
                { value: 'unseen', label: 'Unseen' },
                { value: 'all', label: 'All' },
              ]}
            />
            <TextButton
              aria-label="Mark all seen"
              title="Mark all seen"
              onClick={markAllSeen}
              disabled={!unseenOnScreen.length || bulkAction.isPending}
            >
              <Checks size={14} />
              <Wide css={peekItem ? { display: 'none' } : undefined}>
                Mark all seen
              </Wide>
            </TextButton>
            {selected ? (
              <Popover
                label={`${selected.name} settings`}
                trigger={
                  <IconButton label="Source settings">
                    <GearSix size={16} />
                  </IconButton>
                }
              >
                <SourceSettings
                  subscription={selected}
                  onUnsubscribed={() => select(undefined)}
                />
              </Popover>
            ) : (
              <span style={{ display: 'contents' }}>
                <Popover
                  label={addLabel}
                  trigger={
                    <IconButton label={addLabel}>
                      <Plus size={16} />
                    </IconButton>
                  }
                >
                  {addPanel()}
                </Popover>
              </span>
            )}
          </Toolbar>

          {noFeeds ? (
            <Empty>
              {watching
                ? 'No channels yet. Follow a YouTube channel and its new videos land here.'
                : 'No feeds yet. Add a site or feed address, or import an OPML file from another reader.'}
              <div
                style={{
                  marginTop: 16,
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                {addPanel()}
              </div>
            </Empty>
          ) : !itemsQuery.isPending && listed.length == 0 ? (
            <Empty>
              {view == 'unseen'
                ? 'You are all caught up.'
                : watching
                ? 'No videos from this channel yet.'
                : 'Nothing from this source yet.'}
            </Empty>
          ) : (
            <>
              {hasNewItems && (
                <NewItemsBar>
                  <button onClick={showNewItems}>
                    <ArrowUp size={13} weight="bold" />
                    {watching ? 'New videos' : 'New items'}
                  </button>
                </NewItemsBar>
              )}
              {tab == 'watch' && layout == 'grid' ? (
                <VideoGroups>
                  {videoGroups.map((group) => (
                    <section key={group.label} aria-label={group.label}>
                      <VideoGroup>{group.label}</VideoGroup>
                      <VideoGrid>{group.items.map(cardFor)}</VideoGrid>
                    </section>
                  ))}
                </VideoGroups>
              ) : (
                <ItemList>{listed.map(rowFor)}</ItemList>
              )}
            </>
          )}
          <div ref={sentinel} style={{ height: 1 }} />
        </section>

        {peekItem && !isPhone && <FeedPeekPane {...peekProps(peekItem)} />}
      </Panes>
      {isPhone && peekItem && <FeedPeekSheet open {...peekProps(peekItem)} />}
    </Page>
  )
}
