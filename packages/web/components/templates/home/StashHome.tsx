import {
  Archive,
  ArrowRight,
  ArrowSquareOut,
  Bookmark,
  CaretRight,
  Checks,
  Plus,
  SidebarSimple,
} from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  CSSProperties,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { locale, timeZone } from '../../../lib/dateFormatting'
import { loadThisWeeksEdition } from '../../../lib/edition/store'
import { useEditionStatus } from '../../../lib/edition/useEdition'
import { useHandleAddUrl } from '../../../lib/hooks/useHandleAddUrl'
import {
  BulkAction,
  LibraryItemNode,
  useBulkActions,
  useGetLibraryItems,
  useGetLibraryItemsByIds,
} from '../../../lib/networking/library_items/useLibraryItems'
import {
  markItemsSeen,
  moveItemToFolder,
  setItemArchived,
  subscriptionName,
} from '../../../lib/networking/subscriptions/feeds'
import { useGetSubscriptions } from '../../../lib/networking/subscriptions/useGetSubscriptions'
import { useGetViewer } from '../../../lib/networking/viewer/useGetViewer'
import {
  formatMinutes,
  minutesLeft,
  readingMinutes,
} from '../../../lib/readingTime'
import { faviconFor, shortTimeAgo, siteName } from '../../../lib/textFormatting'
import { showErrorToast, showSuccessToast } from '../../../lib/toastHelpers'
import { navigateWithMorph } from '../../../lib/viewTransition'
import { dayGroup } from '../../../lib/youtube'
import {
  ContextMenu,
  CoverImage,
  IconButton,
  ItemList,
  ItemRow,
  Kbd,
  linkEntries,
  ListSkeleton,
  MenuEntry,
  ProgressLine,
  SegmentedControl,
  showUndoToast,
  SiteIcon,
  SwipeAction,
  UnseenDot,
} from '../../elements/stash'
import { motion, pressable } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import {
  FeedPeekPane,
  FeedPeekSheet,
  PEEK_INLINE,
  PEEK_MIN,
  PEEK_WIDTH,
} from '../feeds/FeedPeek'
import {
  Dot,
  isVisible,
  publishedLabel,
  RowSource,
  useMediaQuery,
} from '../feeds/feedRowParts'
import { AddButton, Btn, CaptureForm, Fallback } from './editionStyles'

// Home: what's new in your feeds, and the few saves you're most likely to
// read next. The Edition has its own page; while an issue is out a strip
// here points to it.

const FEED_LIMIT = 12
const PEEK_WIDTH_KEY = 'feeds-peek-width'

type Tab = 'read' | 'watch'

const isUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const todayLabel = (now: Date) =>
  now.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

// ---------------------------------------------------------------------------
// Layout

const Page = styled('main', {
  width: '100%',
  minHeight: '100vh',
  boxSizing: 'border-box',
  color: '$stInk',
  fontFamily: '$inter',
  padding: '28px 40px 80px',
  '@lgDown': { padding: '24px 28px 64px' },
  '@mdDown': { padding: '12px 16px 40px' },
})

const Column = styled('div', {
  maxWidth: '1180px',
  margin: '0 auto',
  display: 'grid',
  gap: '28px',
  '@mdDown': { gap: '22px' },
  variants: {
    wide: { true: { maxWidth: '1560px' } },
  },
})

const Header = styled('header', {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  minHeight: '38px',
  form: { marginLeft: 'auto', width: 'min(360px, 40%)' },
  '@smDown': {
    flexWrap: 'wrap',
    form: { order: 3, width: '100%', marginLeft: 0 },
  },
})

const TitleBlock = styled('div', {
  display: 'flex',
  alignItems: 'baseline',
  gap: '12px',
  minWidth: 0,
  '@smDown': { flexDirection: 'column', gap: '2px', marginRight: 'auto' },
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

const Today = styled('span', {
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '$stMuted',
  whiteSpace: 'nowrap',
})

// While The Edition is out: a strip in its own masthead style.
const Strip = styled(Link, {
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '28px',
  padding: '14px 0',
  borderTop: '2px solid $stInk',
  borderBottom: '1px solid $stLine',
  color: 'inherit',
  textDecoration: 'none',
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '4px' },
  '@media (hover: hover)': {
    [`&:hover strong`]: {
      textDecoration: 'underline',
      textDecorationThickness: '1px',
    },
  },
  '@mdDown': {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '6px 12px',
    padding: '11px 0 12px',
  },
})

const StripMark = styled('div', {
  display: 'grid',
  gap: '6px',
  b: {
    fontFamily: '$display',
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '-0.045em',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  em: { fontStyle: 'normal', color: '$stAccent' },
  span: {
    fontFamily: '$mono',
    fontSize: '10.5px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '$stMuted',
    whiteSpace: 'nowrap',
  },
  '@mdDown': {
    gridColumn: '1 / -1',
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    b: { fontSize: '17px' },
  },
})

const StripLead = styled('div', {
  display: 'grid',
  gap: '3px',
  minWidth: 0,
  paddingLeft: '28px',
  borderLeft: '1px solid $stLine',
  span: {
    fontFamily: '$mono',
    fontSize: '10.5px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '$stAccentText',
  },
  strong: {
    fontFamily: '$serif',
    fontSize: '21px',
    fontWeight: 400,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '@mdDown': {
    paddingLeft: 0,
    borderLeft: 'none',
    span: { display: 'none' },
    strong: { fontSize: '17px', whiteSpace: 'normal' },
  },
})

const StripGo = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  height: '32px',
  padding: '0 12px',
  borderRadius: '$sm',
  background: '$stInk',
  color: '$stCanvas',
  fontSize: '$small',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  ...pressable,
  '@mdDown': {
    background: 'none',
    color: '$stMuted',
    padding: 0,
    height: 'auto',
    '& > span': { display: 'none' },
  },
})

const Columns = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 330px',
  gridTemplateAreas: '"feeds next"',
  gap: '44px',
  alignItems: 'start',
  '@lgDown': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateAreas: '"next" "feeds"',
    gap: '30px',
  },
  variants: {
    // On wide screens the peek takes Up next's place beside the list.
    peeking: {
      true: {
        gap: '28px',
        gridTemplateColumns: `minmax(0, 1fr) max(${PEEK_MIN}px, min(var(--peek-width, ${PEEK_WIDTH}px), 46%))`,
      },
    },
  },
})

const Feeds = styled('section', { gridArea: 'feeds', minWidth: 0 })
const Next = styled('section', { gridArea: 'next', minWidth: 0 })

const SectionTop = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minHeight: '32px',
  marginBottom: '12px',
  '@smDown': { flexWrap: 'wrap', rowGap: '10px' },
  h2: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
  },
})

const Count = styled('span', {
  fontFamily: '$mono',
  fontSize: '$caption',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  variants: { accent: { true: { color: '$stAccentText' } } },
})

const Trailing = styled('div', {
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  '@smDown': {
    marginLeft: 0,
    width: '100%',
    justifyContent: 'space-between',
  },
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
  whiteSpace: 'nowrap',
  transition: `background ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
  '&:disabled': { opacity: 0.5, cursor: 'default' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  '& > span': { '@smDown': { display: 'none' } },
})

const Group = styled('div', {
  padding: '9px 14px 7px 42px',
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '$stMuted',
  background: '$stCanvas',
})

const More = styled(Link, {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '12px 14px 12px 42px',
  background: '$stCanvas',
  fontSize: '$small',
  color: '$stMuted',
  textDecoration: 'none',
  b: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: 500,
    color: '$stInk',
  },
  '&:hover b': { textDecoration: 'underline' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-2px' },
})

const Empty = styled('div', {
  padding: '32px 16px',
  textAlign: 'center',
  fontSize: '$body',
  color: '$stMuted',
  border: '1px dashed $stLine',
  borderRadius: '$md',
  a: { color: '$stInk', fontWeight: 500 },
})

// Up next

const Featured = styled('article', {
  display: 'grid',
  gap: '8px',
  '@lgDown': { display: 'none' },
})

const FeaturedCover = styled(CoverImage, {
  aspectRatio: '16 / 10',
  borderRadius: '$md',
  cursor: 'pointer',
  marginBottom: '4px',
})

const Kicker = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '$stMuted',
  '& > span:not(:first-child)': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  b: { fontWeight: 500, color: '$stAccentText', flex: 'none' },
})

const headline = {
  all: 'unset',
  cursor: 'pointer',
  fontFamily: '$serif',
  fontWeight: 500,
  color: '$stInk',
  textWrap: 'balance',
  '@media (hover: hover)': {
    '&:hover': { textDecoration: 'underline', textDecorationThickness: '1px' },
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
}

const FeaturedTitle = styled('button', {
  ...headline,
  fontSize: '23px',
  lineHeight: 1.18,
  letterSpacing: '-0.01em',
})

const Progress = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  '& > *:first-child': { flex: 1 },
})

const FeaturedActions = styled('div', {
  display: 'flex',
  gap: '8px',
  marginTop: '6px',
})

const Rest = styled('ol', {
  listStyle: 'none',
  margin: '18px 0 0',
  padding: 0,
  borderTop: '1px solid $stLine',
  '@lgDown': { display: 'none' },
})

const RestRow = styled('li', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 56px',
  gap: '14px',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: '1px solid $stLine',
})

const RestTitle = styled('button', {
  ...headline,
  display: 'block',
  fontSize: '16.5px',
  lineHeight: 1.25,
})

const RestMeta = styled('div', {
  marginTop: '4px',
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const RestThumb = styled(CoverImage, {
  aspectRatio: '1',
  borderRadius: '$sm',
  cursor: 'pointer',
})

const LibraryLink = styled(Link, {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: '12px',
  fontSize: '$small',
  color: '$stMuted',
  textDecoration: 'none',
  b: { fontWeight: 500, color: '$stInk' },
  '&:hover b': { textDecoration: 'underline' },
  '@lgDown': { display: 'none' },
})

// Narrower screens show Up next as a row of cards to swipe through.
const Cards = styled('div', {
  display: 'none',
  '@lgDown': {
    display: 'flex',
    gap: '12px',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    margin: '0 -28px',
    padding: '0 28px 4px',
    scrollPaddingInline: '28px',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
  },
  '@mdDown': {
    margin: '0 -16px',
    padding: '0 16px 4px',
    scrollPaddingInline: '16px',
  },
})

const Card = styled('button', {
  all: 'unset',
  flex: '0 0 228px',
  scrollSnapAlign: 'start',
  display: 'grid',
  gap: '6px',
  alignContent: 'start',
  cursor: 'pointer',
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '& > span:first-child': {
    aspectRatio: '16 / 9',
    borderRadius: '$sm',
    marginBottom: '3px',
  },
  strong: {
    fontFamily: '$serif',
    fontSize: '17px',
    fontWeight: 500,
    lineHeight: 1.22,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
})

// ---------------------------------------------------------------------------

export function StashHome(): JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: viewer } = useGetViewer()
  const addUrl = useHandleAddUrl()
  const bulkAction = useBulkActions()
  const status = useEditionStatus()
  const { data: subscriptions, isPending: subscriptionsPending } =
    useGetSubscriptions({})

  const isPhone = useMediaQuery('(max-width: 768px)')
  const peekInline = useMediaQuery(PEEK_INLINE)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const sourceName = useCallback(
    (item: LibraryItemNode) =>
      subscriptionName(item.subscription, subscriptions) ||
      siteName(item.originalArticleUrl, item.url, item.siteName),
    [subscriptions]
  )
  const sourceIcon = (item: LibraryItemNode) =>
    subscriptions?.find(
      (subscription) =>
        subscription.url == item.subscription ||
        subscription.name == item.subscription
    )?.icon || item.siteIcon
  const sourceIconFallback = (item: LibraryItemNode) =>
    faviconFor(item.originalArticleUrl, item.url)

  // -------------------------------------------------------------------------
  // The Edition, while it's out and not opened yet. Making the issue here
  // means it's ready by the time it's opened.

  const showStrip = status.fresh && !!status.state?.showOnHome
  const editionQuery = useQuery({
    queryKey: ['edition'],
    queryFn: () => loadThisWeeksEdition(sourceName),
    enabled: showStrip && !subscriptionsPending,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
  const issue = editionQuery.data?.editions.find((e) => e.date == status.date)
  const issueLeadId = issue?.entries.find((e) => e.slot == 'lead')?.id
  const issueItems = useGetLibraryItemsByIds(
    `edition-${issue?.date}`,
    issue?.entries.map((e) => e.id) ?? [],
    showStrip && !!issue?.entries.length
  )
  const issueNodes = useMemo(
    () =>
      (issueItems.data?.pages ?? [])
        .flatMap((page) => page.edges)
        .map((edge) => edge.node),
    [issueItems.data]
  )
  const issueLead = issueNodes.find((node) => node.id == issueLeadId)
  const issueMinutes = issueNodes.reduce(
    (sum, node) => sum + (readingMinutes(node.wordsCount) ?? 4),
    0
  )

  // -------------------------------------------------------------------------
  // Save a link, or search

  const captureRef = useRef<HTMLInputElement>(null)
  const [capture, setCapture] = useState('')
  const [captureOpen, setCaptureOpen] = useState(false)
  const submitCapture = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      const value = capture.trim()
      if (!value) return
      if (isUrl(value)) {
        setCapture('')
        await addUrl(value, timeZone, locale)
      } else {
        router.push(`/l/search?q=${encodeURIComponent(value)}`)
      }
    },
    [capture, addUrl, router]
  )

  // -------------------------------------------------------------------------
  // New from your feeds

  const [tab, setTab] = useState<Tab>('read')
  const tabQuery = tab == 'watch' ? 'type:video' : '-type:video'
  const itemsQuery = useGetLibraryItems(
    `home-feeds-${tab}`,
    'following',
    {
      limit: FEED_LIMIT,
      sortDescending: true,
      searchQuery: `${tabQuery} -is:seen sort:published-desc`,
      includeCount: true,
    },
    true,
    2 * 60 * 1000
  )
  const otherQuery = useGetLibraryItems(
    `home-feeds-count-${tab == 'read' ? 'watch' : 'read'}`,
    'following',
    {
      limit: 1,
      sortDescending: true,
      searchQuery: `${tab == 'read' ? 'type:video' : '-type:video'} -is:seen`,
      includeCount: true,
    }
  )
  const total = itemsQuery.data?.pages[0]?.pageInfo.totalCount
  const otherTotal = otherQuery.data?.pages[0]?.pageInfo.totalCount
  const counts = {
    read: tab == 'read' ? total : otherTotal,
    watch: tab == 'watch' ? total : otherTotal,
  }

  const [peekItem, setPeekItem] = useState<LibraryItemNode>()
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [archived, setArchived] = useState<Set<string>>(new Set())
  const [focusId, setFocusId] = useState<string>()

  const items = useMemo(
    () =>
      (itemsQuery.data?.pages[0]?.edges ?? [])
        .map((edge) => edge.node)
        .filter(isVisible),
    [itemsQuery.data]
  )
  const listed = useMemo(
    () =>
      items.filter(
        (item) =>
          item.id == peekItem?.id ||
          (!archived.has(item.id) && !saved.has(item.id))
      ),
    [items, saved, archived, peekItem]
  )

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
      if (width) window.localStorage.setItem(PEEK_WIDTH_KEY, String(width))
      else window.localStorage.removeItem(PEEK_WIDTH_KEY)
    } catch {
      // Storage is unavailable; the width lasts until the page closes.
    }
  }, [])

  // Seen state is kept locally so rows stay put while they are being read.
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const pending = useRef(new Set<string>())
  const flushTimer = useRef<ReturnType<typeof setTimeout>>()
  const refreshCounts = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] == 'libraryItems' &&
        typeof query.queryKey[1] == 'string' &&
        (query.queryKey[1].startsWith('feeds-count-') ||
          query.queryKey[1].startsWith('nav-count-') ||
          query.queryKey[1].startsWith('home-feeds-count-')),
    })
  }, [queryClient])
  const flush = useCallback(async () => {
    const ids = Array.from(pending.current)
    pending.current.clear()
    if (!ids.length) return
    try {
      await markItemsSeen(ids)
      refreshCounts()
    } catch (error) {
      console.log('error marking items seen', error)
    }
  }, [refreshCounts])
  const markSeen = useCallback(
    (ids: string[], immediately = false) => {
      const fresh = ids.filter((id) => !seen.has(id))
      if (!fresh.length) return
      setSeen((current) => new Set([...current, ...fresh]))
      fresh.forEach((id) => pending.current.add(id))
      clearTimeout(flushTimer.current)
      if (immediately) flush()
      else flushTimer.current = setTimeout(flush, 1500)
    },
    [seen, flush]
  )
  useEffect(() => {
    return () => {
      clearTimeout(flushTimer.current)
      flush()
    }
  }, [flush])
  const isSeen = useCallback(
    (item: LibraryItemNode) => !!item.seenAt || seen.has(item.id),
    [seen]
  )

  // As in Feeds, rows that scroll off the top of the screen count as seen.
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
        if (passed.length) markSeen(passed)
      },
      { threshold: 0 }
    )
    rowRefs.current.forEach((element) => observer.current?.observe(element))
    return () => observer.current?.disconnect()
  }, [markSeen])
  const rowRef = (id: string) => (element: HTMLDivElement | null) => {
    const previous = rowRefs.current.get(id)
    if (previous && previous !== element) observer.current?.unobserve(previous)
    if (element) {
      element.dataset.itemId = id
      rowRefs.current.set(id, element)
      observer.current?.observe(element)
    } else {
      rowRefs.current.delete(id)
    }
  }

  const open = useCallback(
    (item: LibraryItemNode) => {
      const username = viewer?.profile.username
      if (!username) return
      if (item.folder == 'following') markSeen([item.id], true)
      window.localStorage.setItem('nav-return', router.asPath)
      navigateWithMorph(router, `/${username}/${item.slug}`, item.id)
    },
    [router, viewer, markSeen]
  )

  const refreshElsewhere = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] == 'libraryItems' &&
        typeof query.queryKey[1] == 'string' &&
        !query.queryKey[1].startsWith(`home-feeds-${tab}`),
    })
  }, [queryClient, tab])

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }

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
    if (peekItem)
      rowRefs.current.get(peekItem.id)?.focus({ preventScroll: true })
    setPeekItem(undefined)
  }, [peekItem])
  const peekIndex = peekItem
    ? listed.findIndex((item) => item.id == peekItem.id)
    : -1
  const step = useCallback(
    (delta: 1 | -1) => {
      const next = listed[peekIndex + delta]
      if (next) openPeek(next)
      else if (delta > 0) {
        setPeekItem(undefined)
        if (isPhone) showUndoToast('You are all caught up')
      }
    },
    [listed, peekIndex, openPeek, isPhone]
  )

  const save = useCallback(
    async (item: LibraryItemNode) => {
      if (saved.has(item.id)) return
      markSeen([item.id])
      setSaved((current) => toggle(current, item.id, true))
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
        showErrorToast('Could not save to Library', {
          position: 'bottom-center',
        })
      }
    },
    [saved, markSeen, refreshElsewhere]
  )

  const archive = useCallback(
    async (item: LibraryItemNode) => {
      if (archived.has(item.id)) return
      markSeen([item.id])
      if (item.id == peekItem?.id) {
        const next = listed[peekIndex + 1] ?? listed[peekIndex - 1]
        if (next && next.id != item.id) openPeek(next)
        else setPeekItem(undefined)
      }
      setArchived((current) => toggle(current, item.id, true))
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
        showErrorToast('Could not archive it', { position: 'bottom-center' })
      }
    },
    [
      archived,
      peekItem,
      listed,
      peekIndex,
      markSeen,
      openPeek,
      refreshElsewhere,
    ]
  )

  const openOriginal = (item: LibraryItemNode) => {
    markSeen([item.id])
    window.open(item.originalArticleUrl || item.url, '_blank', 'noreferrer')
  }

  const markAllSeen = useCallback(async () => {
    try {
      await bulkAction.mutateAsync({
        action: BulkAction.MARK_AS_SEEN,
        query: `in:following use:folders ${tabQuery} -is:seen`,
        expectedCount: total ?? items.length,
      })
      setSeen(new Set(items.map((item) => item.id)))
      refreshCounts()
      showSuccessToast(
        tab == 'watch'
          ? 'Marked all videos as seen'
          : 'Marked all feeds as seen',
        { position: 'bottom-right' }
      )
    } catch {
      showErrorToast('Could not mark items as seen', {
        position: 'bottom-right',
      })
    }
  }, [bulkAction, tabQuery, total, items, tab, refreshCounts])

  const changeTab = (next: Tab) => {
    if (next == tab) return
    clearTimeout(flushTimer.current)
    flush()
    setTab(next)
    setPeekItem(undefined)
    setSeen(new Set())
  }

  // Keyboard, as in Feeds: j and k move, space peeks, o opens, s saves,
  // Backspace archives, v opens the original page, / saves a link.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target.closest('input, textarea, select, [contenteditable="true"]') ||
        document.querySelector('[role="dialog"]')
      ) {
        return
      }
      const index = listed.findIndex((item) => item.id == focusId)
      const current = peekItem ?? (index >= 0 ? listed[index] : undefined)
      const move = (next?: LibraryItemNode) => {
        if (!next) return
        setFocusId(next.id)
        rowRefs.current.get(next.id)?.focus()
      }
      switch (event.key) {
        case '/':
          event.preventDefault()
          flushSync(() => setCaptureOpen(true))
          captureRef.current?.focus()
          break
        case 'j':
          event.preventDefault()
          if (peekItem) step(1)
          else move(listed[Math.min(listed.length - 1, index + 1)])
          break
        case 'k':
          event.preventDefault()
          if (peekItem) step(-1)
          else move(listed[Math.max(0, index - 1)])
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
          if (current) {
            event.preventDefault()
            archive(current)
          }
          break
        case 'v':
          if (current) openOriginal(current)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // Day groups: Today, Yesterday, This week, then months.
  const groups = useMemo(() => {
    const list: { label: string; items: LibraryItemNode[] }[] = []
    for (const item of listed) {
      const label = dayGroup(item.publishedAt || item.savedAt, now)
      const last = list[list.length - 1]
      if (last?.label == label) last.items.push(item)
      else list.push({ label, items: [item] })
    }
    return list
  }, [listed, now])
  const more = Math.max(0, (total ?? 0) - items.length)

  const menuFor = (item: LibraryItemNode): MenuEntry[] => [
    { label: 'Read in Stash', shortcut: '↵', onSelect: () => open(item) },
    {
      label: item.id == peekItem?.id ? 'Close peek' : 'Peek',
      shortcut: 'Space',
      onSelect: () => (item.id == peekItem?.id ? closePeek() : openPeek(item)),
    },
    {
      label: saved.has(item.id) ? 'Saved to Library' : 'Save to Library',
      shortcut: 'S',
      separated: true,
      onSelect: () => save(item),
    },
    { label: 'Archive', shortcut: '⌫', onSelect: () => archive(item) },
    ...linkEntries(item.originalArticleUrl || item.url, () =>
      openOriginal(item)
    ),
  ]

  const rowFor = (item: LibraryItemNode) => {
    const itemSeen = isSeen(item)
    return (
      <SwipeAction
        key={item.id}
        label="Save"
        icon={<Bookmark size={16} />}
        onAction={() => save(item)}
        start={{
          label: 'Archive',
          icon: <Archive size={16} />,
          onAction: () => archive(item),
        }}
      >
        <ContextMenu entries={menuFor(item)}>
          <ItemRow
            ref={rowRef(item.id)}
            leading={<UnseenDot hidden={itemSeen} />}
            title={item.title}
            morphId={item.id}
            image={item.image}
            subtitle={
              <RowSource>
                <SiteIcon
                  src={sourceIcon(item)}
                  fallbackSrc={sourceIconFallback(item)}
                  name={sourceName(item)}
                  size={14}
                  round={tab == 'watch'}
                />
                {[
                  sourceName(item),
                  item.author &&
                  item.author !=
                    subscriptionName(item.subscription, subscriptions)
                    ? item.author
                    : undefined,
                  saved.has(item.id) ? 'Saved' : undefined,
                ]
                  .filter(Boolean)
                  .map((part, index) => (
                    <Fragment key={index}>
                      {index > 0 && <Dot />}
                      {part}
                    </Fragment>
                  ))}
                <Dot />
                <time
                  dateTime={item.publishedAt || item.savedAt}
                  title={publishedLabel(item)}
                >
                  {shortTimeAgo(
                    item.publishedAt || item.savedAt,
                    now.getTime()
                  )}
                </time>
              </RowSource>
            }
            excerpt={tab == 'watch' ? undefined : item.description}
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
        </ContextMenu>
      </SwipeAction>
    )
  }

  const peekProps = (item: LibraryItemNode) => ({
    item,
    username: viewer?.profile.username,
    sourceName: sourceName(item),
    sourceIcon: sourceIcon(item),
    sourceIconFallback: sourceIconFallback(item),
    position: Math.max(1, peekIndex + 1),
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

  // -------------------------------------------------------------------------
  // Up next: anything you've started, then your newest unread saves.

  const upNextCount = status.state?.upNext ?? 5
  const readingQuery = useGetLibraryItems('home-upnext-reading', 'inbox', {
    limit: 5,
    sortDescending: true,
    searchQuery: 'is:reading sort:read-desc',
  })
  const unreadQuery = useGetLibraryItems('home-upnext', 'inbox', {
    limit: 8,
    sortDescending: true,
    searchQuery: 'is:unread sort:saved-desc',
    includeCount: true,
  })
  const unreadTotal = unreadQuery.data?.pages[0]?.pageInfo.totalCount
  const upNext = useMemo(() => {
    const seenIds = new Set<string>()
    return [
      ...(readingQuery.data?.pages[0]?.edges ?? []),
      ...(unreadQuery.data?.pages[0]?.edges ?? []),
    ]
      .map((edge) => edge.node)
      .filter((node) => {
        if (seenIds.has(node.id) || !isVisible(node)) return false
        seenIds.add(node.id)
        return (node.readingProgressPercent ?? 0) < 90
      })
      .slice(0, upNextCount)
  }, [readingQuery.data, unreadQuery.data, upNextCount])

  const archiveSave = useCallback(
    async (item: LibraryItemNode) => {
      try {
        await setItemArchived(item.id, true)
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] == 'libraryItems' &&
            typeof query.queryKey[1] == 'string' &&
            !query.queryKey[1].startsWith('home-feeds'),
        })
        showUndoToast('Archived', async () => {
          await setItemArchived(item.id, false)
          queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
        })
      } catch {
        showErrorToast('Could not archive it', { position: 'bottom-center' })
      }
    },
    [queryClient]
  )

  const fallbackFor = (item: LibraryItemNode, size = 22) => (
    <Fallback>
      <SiteIcon
        src={sourceIcon(item)}
        fallbackSrc={sourceIconFallback(item)}
        name={sourceName(item)}
        size={size}
      />
    </Fallback>
  )
  const progressOf = (item: LibraryItemNode) => {
    if ((item.readingProgressPercent ?? 0) < 2) return undefined
    const left = minutesLeft(item.wordsCount, item.readingProgressPercent)
    return left !== undefined
      ? `${formatMinutes(left)} left`
      : `${Math.round(item.readingProgressPercent)}%`
  }
  const whyOf = (item: LibraryItemNode) =>
    progressOf(item)
      ? 'Pick up again'
      : `Saved ${shortTimeAgo(item.savedAt || item.createdAt, now.getTime())}`

  const featured = upNext[0]
  const rest = upNext.slice(1)
  const loadingNext = readingQuery.isPending || unreadQuery.isPending

  const upNextSection = (
    <Next aria-label="Up next">
      <SectionTop>
        <h2>Up next</h2>
        {unreadTotal !== undefined && <Count>{upNext.length} to read</Count>}
      </SectionTop>
      {!loadingNext && upNext.length == 0 && (
        <Empty>Nothing waiting. Save an article and it shows up here.</Empty>
      )}
      {featured && (
        <Featured>
          <FeaturedCover
            src={featured.headerImage ?? featured.image}
            fallback={fallbackFor(featured, 36)}
            onClick={() => open(featured)}
          />
          <Kicker>
            <SiteIcon
              src={sourceIcon(featured)}
              fallbackSrc={sourceIconFallback(featured)}
              name={sourceName(featured)}
              size={14}
            />
            <span>{sourceName(featured)}</span>
            <b>· {whyOf(featured)}</b>
          </Kicker>
          <FeaturedTitle
            type="button"
            data-morph-title={featured.id}
            onClick={() => open(featured)}
          >
            {featured.title}
          </FeaturedTitle>
          <Progress>
            {progressOf(featured) ? (
              <>
                <ProgressLine percent={featured.readingProgressPercent} />
                {progressOf(featured)}
              </>
            ) : (
              formatMinutes(readingMinutes(featured.wordsCount))
            )}
          </Progress>
          <FeaturedActions>
            <Btn primary type="button" onClick={() => open(featured)}>
              {progressOf(featured) ? 'Continue' : 'Read'}
            </Btn>
            <Btn type="button" onClick={() => archiveSave(featured)}>
              Archive
            </Btn>
          </FeaturedActions>
        </Featured>
      )}
      {rest.length > 0 && (
        <Rest>
          {rest.map((item) => (
            <RestRow key={item.id}>
              <div style={{ minWidth: 0 }}>
                <RestTitle
                  type="button"
                  data-morph-title={item.id}
                  onClick={() => open(item)}
                >
                  {item.title}
                </RestTitle>
                <RestMeta>
                  {[
                    sourceName(item),
                    progressOf(item) ??
                      formatMinutes(readingMinutes(item.wordsCount)),
                    progressOf(item) ? undefined : whyOf(item),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </RestMeta>
              </div>
              <RestThumb
                src={item.headerImage ?? item.image}
                fallback={fallbackFor(item)}
                onClick={() => open(item)}
              />
            </RestRow>
          ))}
        </Rest>
      )}
      {upNext.length > 0 && (
        <Cards>
          {upNext.map((item) => (
            <Card key={item.id} onClick={() => open(item)}>
              <CoverImage
                src={item.headerImage ?? item.image}
                fallback={fallbackFor(item, 28)}
              />
              <Kicker>
                <span>{sourceName(item)}</span>
                {progressOf(item) ? (
                  <b>· {progressOf(item)}</b>
                ) : (
                  <span>
                    · {formatMinutes(readingMinutes(item.wordsCount))}
                  </span>
                )}
              </Kicker>
              <strong data-morph-title={item.id}>{item.title}</strong>
              {progressOf(item) && (
                <ProgressLine percent={item.readingProgressPercent} />
              )}
            </Card>
          ))}
        </Cards>
      )}
      {upNext.length > 0 && !!unreadTotal && (
        <LibraryLink href="/l/library">
          <span>From your Library</span>
          <b>All {unreadTotal} unread →</b>
        </LibraryLink>
      )}
    </Next>
  )

  const peekingInline = !!peekItem && peekInline && !isPhone

  return (
    <Page>
      <Column
        wide={peekingInline}
        style={
          peekWidth
            ? ({ '--peek-width': `${peekWidth}px` } as CSSProperties)
            : undefined
        }
      >
        <Header>
          <TitleBlock>
            <Title>Home</Title>
            <Today>{todayLabel(now)}</Today>
          </TitleBlock>
          <AddButton
            type="button"
            aria-label="Save a link or search"
            aria-expanded={captureOpen}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              if (captureOpen) {
                setCaptureOpen(false)
                captureRef.current?.blur()
                return
              }
              // Show and focus in the same tap so iOS raises the keyboard.
              flushSync(() => setCaptureOpen(true))
              captureRef.current?.focus()
            }}
          >
            <Plus size={18} weight="bold" />
          </AddButton>
          <CaptureForm
            onSubmit={submitCapture}
            role="search"
            data-open={captureOpen}
          >
            <Plus size={15} aria-hidden="true" />
            <input
              ref={captureRef}
              type="text"
              inputMode="url"
              autoComplete="off"
              enterKeyHint="go"
              aria-label="Paste a link to save it, or search your library"
              placeholder="Paste a link to save, or search"
              value={capture}
              onChange={(event) => setCapture(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setCapture('')
                  event.currentTarget.blur()
                }
              }}
              onBlur={() => {
                if (!capture.trim()) setCaptureOpen(false)
              }}
            />
            <Kbd>/</Kbd>
          </CaptureForm>
        </Header>

        {showStrip && status.date && (
          <Strip href="/l/edition" aria-label="Open this week's Edition">
            <StripMark>
              <b>
                The Edition<em>.</em>
              </b>
              <span>
                {issue ? `No. ${issue.number} · ` : ''}
                {issue ? `${issue.entries.length} stories` : 'Out now'}
              </span>
            </StripMark>
            <StripLead>
              <span>
                This week&apos;s issue
                {issueMinutes > 0 && ` · ${formatMinutes(issueMinutes)}`}
              </span>
              <strong>
                {issueLead?.title ??
                  'The week’s best you missed, old saves worth another look, and someone new'}
              </strong>
            </StripLead>
            <StripGo>
              <span>Open the issue</span>
              {isPhone ? <CaretRight size={16} /> : <ArrowRight size={14} />}
            </StripGo>
          </Strip>
        )}

        <Columns peeking={peekingInline}>
          <Feeds aria-label="New from your feeds">
            <SectionTop>
              <h2>New from your feeds</h2>
              {total !== undefined && (
                <Count accent={total > 0}>
                  {total} {tab == 'watch' ? 'new' : 'unseen'}
                </Count>
              )}
              <Trailing>
                <SegmentedControl
                  label="Show"
                  value={tab}
                  onChange={changeTab}
                  options={[
                    {
                      value: 'read',
                      label: counts.read ? `Read ${counts.read}` : 'Read',
                    },
                    {
                      value: 'watch',
                      label: counts.watch ? `Watch ${counts.watch}` : 'Watch',
                    },
                  ]}
                />
                <TextButton
                  aria-label="Mark all seen"
                  title="Mark all seen"
                  onClick={markAllSeen}
                  disabled={!items.length || bulkAction.isPending}
                >
                  <Checks size={14} />
                  <span>Mark all seen</span>
                </TextButton>
              </Trailing>
            </SectionTop>
            {itemsQuery.isPending ? (
              <ListSkeleton />
            ) : listed.length == 0 ? (
              <Empty>
                You&apos;re all caught up.{' '}
                <Link
                  href={
                    tab == 'watch'
                      ? '/l/subscriptions?tab=watch'
                      : '/l/subscriptions'
                  }
                >
                  Open Feeds
                </Link>
              </Empty>
            ) : (
              <ItemList>
                {groups.map((group) => (
                  <Fragment key={group.label}>
                    <Group>{group.label}</Group>
                    {group.items.map(rowFor)}
                  </Fragment>
                ))}
                <More
                  href={
                    tab == 'watch'
                      ? '/l/subscriptions?tab=watch'
                      : '/l/subscriptions'
                  }
                >
                  <span>
                    {more > 0
                      ? `${more} more ${tab == 'watch' ? 'new' : 'unseen'}`
                      : 'All your feeds'}
                  </span>
                  <b>
                    Open Feeds <ArrowRight size={13} />
                  </b>
                </More>
              </ItemList>
            )}
          </Feeds>
          {peekItem && !isPhone ? (
            <FeedPeekPane {...peekProps(peekItem)} />
          ) : null}
          {!peekingInline && upNextSection}
        </Columns>
      </Column>
      {isPhone && peekItem && <FeedPeekSheet open {...peekProps(peekItem)} />}
    </Page>
  )
}
