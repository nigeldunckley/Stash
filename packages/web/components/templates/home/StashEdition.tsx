import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  Plus,
  X,
} from '@phosphor-icons/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { locale, timeZone } from '../../../lib/dateFormatting'
import type {
  Edition,
  EditionEntry,
  EditionSlot,
} from '../../../lib/edition/engine'
import {
  EditionState,
  loadTodaysEdition,
  updateEditionState,
} from '../../../lib/edition/store'
import { useHandleAddUrl } from '../../../lib/hooks/useHandleAddUrl'
import useLibraryItemActions from '../../../lib/hooks/useLibraryItemActions'
import { State } from '../../../lib/networking/fragments/articleFragment'
import {
  LibraryItemNode,
  useGetLibraryItems,
  useGetLibraryItemsByIds,
} from '../../../lib/networking/library_items/useLibraryItems'
import {
  markItemsSeen,
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
import {
  ContextMenu,
  CoverImage,
  Kbd,
  linkEntries,
  MenuEntry,
  ProgressLine,
  SiteIcon,
} from '../../elements/stash'
import { motion, pressable, reducedMotion } from '../../elements/stash/motion'
import { keyframes, styled } from '../../tokens/stitches.config'
import { navigateWithMorph } from '../../../lib/viewTransition'

// Home: The Edition, a front page made once a day. See lib/edition/engine.ts
// for how stories are chosen.

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
  maxWidth: '1080px',
  margin: '0 auto',
  display: 'grid',
  gap: '32px',
  '@mdDown': { gap: '26px' },
})

const Mast = styled('header', { display: 'grid', gap: '12px' })

const MastTop = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: '16px',
  paddingBottom: '10px',
  borderBottom: '2px solid $stInk',
})

const MastTitle = styled('h1', {
  margin: 0,
  fontFamily: '$display',
  fontSize: '44px',
  fontWeight: 700,
  letterSpacing: '-0.045em',
  lineHeight: 1,
  whiteSpace: 'nowrap',
  em: { fontStyle: 'normal', color: '$stAccent' },
  '@mdDown': { fontSize: '34px' },
})

const MastDate = styled('div', {
  display: 'flex',
  alignItems: 'flex-end',
  gap: '10px',
  fontFamily: '$mono',
  fontSize: '$caption',
  lineHeight: 1.6,
  color: '$stInk2',
  textAlign: 'right',
  textTransform: 'uppercase',
  fontVariantNumeric: 'tabular-nums',
  '@mdDown': { fontSize: '10.5px' },
})

const LongDate = styled('span', { '@mdDown': { display: 'none' } })
const ShortDate = styled('span', {
  display: 'none',
  '@mdDown': { display: 'inline' },
})

const Arrows = styled('span', {
  display: 'inline-flex',
  gap: '2px',
  button: {
    all: 'unset',
    display: 'grid',
    placeItems: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '$sm',
    color: '$stMuted',
    cursor: 'pointer',
    '&:hover:not(:disabled)': { color: '$stInk', background: '$stSunken' },
    '&:disabled': { opacity: 0.3, cursor: 'default' },
    '&:focus-visible': { outline: '2px solid $stAccent' },
  },
})

const MastSub = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  fontSize: '$small',
  color: '$stMuted',
  '@mdDown': { flexDirection: 'column', alignItems: 'flex-start', gap: '8px' },
})

const TimeRow = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '6px 14px',
  marginTop: '12px',
  fontSize: '$small',
  color: '$stMuted',
})

const Chips = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '6px',
  '& > span': { marginRight: '4px' },
})

const Chip = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  height: '28px',
  padding: '0 11px',
  display: 'inline-flex',
  alignItems: 'center',
  fontFamily: '$mono',
  fontSize: '12px',
  borderRadius: '999px',
  border: '1px solid $stLine',
  color: '$stInk2',
  background: '$stSurface',
  cursor: 'pointer',
  transition: `background ${motion.fast}, color ${motion.fast}, border-color ${motion.fast}`,
  '&:hover': { borderColor: '$stLineStrong' },
  '&[aria-pressed="true"]': {
    background: '$stInk',
    color: '$stSurface',
    borderColor: '$stInk',
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

const Fit = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  fontFamily: '$mono',
  fontSize: '$micro',
  '& > i': {
    display: 'block',
    width: '120px',
    height: '4px',
    borderRadius: '2px',
    background: '$stLine',
    overflow: 'hidden',
  },
  '& > i > b': {
    display: 'block',
    height: '100%',
    background: '$stAccent',
    transition: `width ${motion.base}`,
  },
})

// Time you have, in minutes; null is the whole edition.
const BUDGETS = [5, 15, 45] as const
const minutesOf = (item: LibraryItemNode) =>
  readingMinutes(item.wordsCount) ?? 4

const fill = keyframes({
  from: { transform: 'scaleX(0.2)', opacity: 0.4 },
  to: { transform: 'none', opacity: 1 },
})

const Ticks = styled('span', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flex: 'none',
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  fontVariantNumeric: 'tabular-nums',
  '& > span': { display: 'inline-flex', gap: '3px' },
  i: {
    width: '14px',
    height: '4px',
    borderRadius: '1px',
    background: '$stLineStrong',
  },
  'i[data-done="true"]': {
    background: '$stAccent',
    animation: `${fill} 500ms ease-out both`,
    [reducedMotion]: { animation: 'none' },
  },
})

const CaptureForm = styled('form', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '0 12px',
  height: '38px',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$sm',
  color: '$stMuted',
  transition: `border-color ${motion.fast}, box-shadow ${motion.fast}`,
  '&:focus-within': {
    borderColor: '$stLineStrong',
    boxShadow: '0 0 0 3px $colors$stAccentTint',
  },
  input: {
    all: 'unset',
    flex: 1,
    minWidth: 0,
    fontFamily: '$inter',
    fontSize: '$body',
    color: '$stInk',
    '&::placeholder': { color: '$stMuted' },
  },
  '@mdDown': { kbd: { display: 'none' } },
  // On iPhone the field folds into the masthead's + button and opens
  // only when asked for.
  '@smDown': {
    height: '44px',
    '&:not([data-open="true"])': { display: 'none' },
  },
})

const AddButton = styled('button', {
  all: 'unset',
  display: 'none',
  placeItems: 'center',
  flex: 'none',
  alignSelf: 'center',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  border: '1px solid $stLine',
  background: '$stSurface',
  color: '$stInk',
  cursor: 'pointer',
  ...pressable,
  '&[aria-expanded="true"]': {
    background: '$stInk',
    borderColor: '$stInk',
    color: '$stCanvas',
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '@smDown': { display: 'grid' },
})

const Source = styled('div', {
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

const Meta = styled('div', {
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  textTransform: 'uppercase',
  fontVariantNumeric: 'tabular-nums',
})

const selectable = {
  borderRadius: '$sm',
  outline: '2px solid transparent',
  outlineOffset: '6px',
  transition: `outline-color ${motion.fast}, opacity ${motion.base}`,
  '&[data-selected="true"]': { outlineColor: '$stAccentTint' },
  '&[data-done="true"]': { opacity: 0.55 },
  '&[data-done="true"]:hover': { opacity: 1 },
}

const Lead = styled('article', {
  ...selectable,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)',
  gap: '28px',
  alignItems: 'center',
  '@mdDown': { gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px' },
})

const LeadCover = styled(CoverImage, {
  aspectRatio: '4 / 3',
  borderRadius: '$sm',
  cursor: 'pointer',
  '@mdDown': {
    aspectRatio: '3 / 2',
    // Leave the headline above the fold on a phone.
    maxHeight: '40svh',
    margin: '0 -16px',
    borderRadius: 0,
    '&::after': { display: 'none' },
  },
})

const Fallback = styled('span', {
  display: 'grid',
  placeItems: 'center',
  width: '100%',
  height: '100%',
})

const LeadCopy = styled('div', { display: 'grid', gap: '12px', minWidth: 0 })

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

const LeadTitle = styled('button', {
  ...headline,
  fontSize: '38px',
  lineHeight: 1.08,
  letterSpacing: '-0.015em',
  '@lgDown': { fontSize: '32px' },
  '@mdDown': { fontSize: '28px', lineHeight: 1.1 },
})

const Dek = styled('p', {
  margin: 0,
  fontFamily: '$serif',
  fontSize: '18px',
  lineHeight: 1.45,
  color: '$stInk2',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  '@mdDown': { fontSize: '16px' },
})

const Actions = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginTop: '4px',
  // Full-width, thumb-sized buttons on a phone.
  '@smDown': {
    display: 'grid',
    gridAutoFlow: 'column',
    gridAutoColumns: '1fr',
    '& > button': { height: '44px', justifyContent: 'center' },
  },
})

const Btn = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '32px',
  padding: '0 12px',
  border: '1px solid $stLineStrong',
  borderRadius: '$sm',
  background: '$stSurface',
  fontSize: '$small',
  fontWeight: 500,
  color: '$stInk',
  cursor: 'pointer',
  transition: `background ${motion.fast}, border-color ${motion.fast}, transform ${motion.fast}`,
  ...pressable,
  '@media (hover: hover)': { '&:hover': { borderColor: '$stMuted' } },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  kbd: { '@mdDown': { display: 'none' } },
  variants: {
    primary: {
      true: {
        background: '$stInk',
        borderColor: '$stInk',
        color: '$stCanvas',
        '@media (hover: hover)': {
          '&:hover': { borderColor: '$stInk', opacity: 0.9 },
        },
        kbd: {
          background: 'transparent',
          color: 'inherit',
          borderColor: 'currentColor',
          opacity: 0.6,
        },
      },
    },
  },
})

const SectionHead = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '12px',
  borderTop: '1px solid $stInk',
  paddingTop: '8px',
  marginBottom: '14px',
  h2: {
    margin: 0,
    fontSize: '$caption',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  span: { fontFamily: '$mono', fontSize: '$micro', color: '$stMuted' },
})

const Picks = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '24px',
  '@mdDown': {
    display: 'flex',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    scrollPaddingInline: '16px',
    margin: '0 -16px',
    padding: '0 16px 4px',
    gap: '14px',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
    '& > *': { flex: '0 0 78%', scrollSnapAlign: 'start' },
  },
})

const Story = styled('article', {
  ...selectable,
  display: 'grid',
  gap: '8px',
  alignContent: 'start',
  minWidth: 0,
})

const StoryCover = styled(CoverImage, {
  aspectRatio: '16 / 10',
  borderRadius: '$sm',
  cursor: 'pointer',
})

const StoryTitle = styled('button', {
  ...headline,
  fontSize: '21px',
  lineHeight: 1.18,
  letterSpacing: '-0.01em',
  '@mdDown': { fontSize: '19px' },
})

const StoryDek = styled('p', {
  margin: 0,
  fontFamily: '$serif',
  fontSize: '15px',
  lineHeight: 1.45,
  color: '$stInk2',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const StoryFoot = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
})

const Quiet = styled('span', {
  display: 'inline-flex',
  gap: '2px',
  button: {
    all: 'unset',
    display: 'grid',
    placeItems: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '$sm',
    color: '$stMuted',
    cursor: 'pointer',
    '&:hover': { color: '$stInk', background: '$stSunken' },
    '&:focus-visible': { outline: '2px solid $stAccent' },
  },
})

const Lower = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
  gap: '40px',
  alignItems: 'start',
  '@mdDown': { gridTemplateColumns: 'minmax(0, 1fr)', gap: '26px' },
})

const Stack = styled('div', { display: 'grid', gap: '28px', minWidth: 0 })

const Brief = styled('ul', { listStyle: 'none', margin: 0, padding: 0 })

const BriefRow = styled('li', {
  ...selectable,
  outlineOffset: '2px',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '12px',
  alignItems: 'center',
  padding: '11px 0',
  borderBottom: '1px solid $stLine',
})

const BriefTitle = styled('button', {
  ...headline,
  display: 'block',
  marginTop: '3px',
  fontSize: '17px',
  lineHeight: 1.3,
})

const BriefEnd = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
})

const Resume = styled('a', {
  display: 'grid',
  gridTemplateColumns: '56px minmax(0, 1fr)',
  gap: '12px',
  alignItems: 'center',
  color: 'inherit',
  textDecoration: 'none',
  '& + &': { marginTop: '12px' },
  '&:hover strong': { textDecoration: 'underline' },
  strong: {
    display: 'block',
    fontFamily: '$serif',
    fontSize: '16px',
    fontWeight: 500,
    lineHeight: 1.25,
  },
})

const Thumb = styled(CoverImage, {
  aspectRatio: '1',
  borderRadius: '$sm',
})

const ResumeMeta = styled(Meta, {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '8px',
  marginTop: '4px',
})

const Videos = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '14px',
})

const Video = styled('button', {
  all: 'unset',
  display: 'grid',
  gap: '6px',
  minWidth: 0,
  cursor: 'pointer',
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '& > span:first-child': { aspectRatio: '16 / 9', borderRadius: '$sm' },
  strong: { fontSize: '$small', fontWeight: 500, lineHeight: 1.3 },
  '&:hover strong': { textDecoration: 'underline' },
})

const Colophon = styled('footer', {
  borderTop: '2px solid $stInk',
  paddingTop: '14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px 16px',
  flexWrap: 'wrap',
  '& p': {
    margin: 0,
    fontFamily: '$serif',
    fontStyle: 'italic',
    fontSize: '17px',
    color: '$stInk2',
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '$small',
    color: '$stMuted',
  },
  select: {
    font: 'inherit',
    fontFamily: '$mono',
    color: '$stInk',
    background: '$stSurface',
    border: '1px solid $stLineStrong',
    borderRadius: '$sm',
    padding: '4px 6px',
  },
})

const Notice = styled('div', {
  padding: '36px 16px',
  textAlign: 'center',
  fontSize: '$body',
  color: '$stMuted',
  border: '1px dashed $stLine',
  borderRadius: '$md',
  display: 'grid',
  gap: '12px',
  justifyItems: 'center',
})

const pulse = keyframes({ '50%': { opacity: 0.45 } })

const Making = styled('div', {
  display: 'grid',
  gap: '14px',
  '& > i': {
    display: 'block',
    height: '14px',
    borderRadius: '$sm',
    background: '$stSunken',
    animation: `${pulse} 1.4s ease-in-out infinite`,
    [reducedMotion]: { animation: 'none' },
  },
})

const isUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const isFeedItem = (item: LibraryItemNode) => item.folder === 'following'

const longDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`

const SLOT_ORDER: EditionSlot[] = ['lead', 'pick', 'popular', 'brief']

export function StashEdition(): JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: viewer } = useGetViewer()
  const addUrl = useHandleAddUrl()
  const { moveItem } = useLibraryItemActions()
  const { data: subscriptions, isPending: subscriptionsPending } =
    useGetSubscriptions({})

  const sourceOf = useCallback(
    (item: LibraryItemNode) =>
      subscriptionName(item.subscription, subscriptions) ||
      siteName(item.originalArticleUrl, item.url, item.siteName),
    [subscriptions]
  )
  const iconOf = (item: LibraryItemNode) =>
    subscriptions?.find(
      (subscription) =>
        subscription.url == item.subscription ||
        subscription.name == item.subscription
    )?.icon || item.siteIcon

  const stateQuery = useQuery({
    queryKey: ['edition'],
    queryFn: () => loadTodaysEdition(sourceOf),
    enabled: !subscriptionsPending,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
  const state = stateQuery.data

  // Which stored edition is on screen: 0 is today's.
  const [index, setIndex] = useState(0)
  const edition: Edition | undefined = state?.editions[index]

  // Skips show at once and are saved in the background.
  const [localSkips, setLocalSkips] = useState<Set<string>>(new Set())
  const skipped = useMemo(
    () => new Set([...(edition?.skipped ?? []), ...localSkips]),
    [edition, localSkips]
  )

  const ids = useMemo(
    () => edition?.entries.map((entry) => entry.id) ?? [],
    [edition]
  )
  const itemsQuery = useGetLibraryItemsByIds(
    `edition-${edition?.date}`,
    ids,
    ids.length > 0
  )
  const items = useMemo(() => {
    const map = new Map<string, LibraryItemNode>()
    itemsQuery.data?.pages
      .flatMap((page) => page.edges)
      .forEach((edge) => map.set(edge.node.id, edge.node))
    return map
  }, [itemsQuery.data])

  const continueQuery = useGetLibraryItems('home-continue', 'inbox', {
    limit: 4,
    sortDescending: true,
    searchQuery: 'is:reading sort:read-desc',
  })
  const inProgress = useMemo(
    () =>
      (continueQuery.data?.pages ?? [])
        .flatMap((page) => page.edges)
        .map((edge) => edge.node)
        .filter((item) => !ids.includes(item.id))
        .slice(0, 2),
    [continueQuery.data, ids]
  )

  // Seen is not done: Feeds marks items seen as they scroll past, so only
  // reading, skipping, saving or archiving counts.
  const isDone = useCallback(
    (item: LibraryItemNode) =>
      skipped.has(item.id) ||
      (item.readingProgressPercent ?? 0) >= 2 ||
      item.state === State.ARCHIVED ||
      (!!item.subscription && !isFeedItem(item)),
    [skipped]
  )

  type Shown = EditionEntry & { item: LibraryItemNode }
  const shown = useMemo(() => {
    const list: Shown[] = []
    edition?.entries.forEach((entry) => {
      const item = items.get(entry.id)
      if (item && item.state !== State.DELETED && !skipped.has(entry.id)) {
        list.push({ ...entry, item })
      }
    })
    return list
  }, [edition, items, skipped])

  // "I have 15 min": keep the engine's order and take what fits, from the
  // stories not read yet. The first that fits leads if the lead doesn't.
  const [budget, setBudget] = useState<number | null>(null)
  const fitted = useMemo(() => {
    // The chips only show on today's edition, so earlier ones stay whole.
    if (budget === null || index !== 0) return undefined
    const chosen: Shown[] = []
    let used = 0
    // No one piece takes most of a longer slot, so it stays a mix.
    const longest = Math.max(5, Math.round(budget * 0.6))
    SLOT_ORDER.forEach((slot) =>
      shown
        .filter((s) => s.slot === slot && !isDone(s.item))
        .forEach((s) => {
          const minutes = minutesOf(s.item)
          if (minutes <= longest && used + minutes <= budget) {
            chosen.push(s)
            used += minutes
          }
        })
    )
    return { chosen, used }
  }, [budget, index, shown, isDone])
  const visible = useMemo(() => {
    if (!fitted) return shown
    return fitted.chosen.map((s, i) =>
      i === 0 && s.slot !== 'lead'
        ? {
            ...s,
            slot: 'lead' as EditionSlot,
            why: s.why ?? `Fits your ${budget} min`,
          }
        : s
    )
  }, [fitted, shown, budget])
  const inSlot = (slot: EditionSlot) => visible.filter((s) => s.slot === slot)

  const stories = (edition?.entries ?? []).filter((e) => e.slot !== 'watch')
  const doneCount = stories.filter((entry) => {
    const item = items.get(entry.id)
    return skipped.has(entry.id) || (item ? isDone(item) : false)
  }).length
  const totalMinutes = shown
    .filter((s) => s.slot !== 'watch')
    .reduce((sum, s) => sum + (readingMinutes(s.item.wordsCount) ?? 4), 0)

  // Keyboard order: lead, picks, popular, then the short list.
  const order = useMemo(
    () =>
      SLOT_ORDER.flatMap((slot) => visible.filter((s) => s.slot === slot)).map(
        (s) => s.item
      ),
    [visible]
  )
  // Being up to date, and "mark the rest as seen", cover the whole edition,
  // not just what fits the time chosen.
  const fullOrder = useMemo(
    () =>
      SLOT_ORDER.flatMap((slot) => shown.filter((s) => s.slot === slot)).map(
        (s) => s.item
      ),
    [shown]
  )
  const [selectedId, setSelectedId] = useState<string>()

  const open = useCallback(
    (item: LibraryItemNode) => {
      const username = viewer?.profile.username
      if (!username) return
      if (isFeedItem(item) && !item.seenAt) {
        markItemsSeen([item.id]).catch((error) =>
          console.log('error marking item seen', error)
        )
      }
      window.localStorage.setItem('nav-return', router.asPath)
      if (item.state === State.PROCESSING) {
        router.push(`/article?url=${encodeURIComponent(item.url)}`)
      } else {
        navigateWithMorph(router, `/${username}/${item.slug}`, item.id)
      }
    },
    [router, viewer]
  )

  const refreshItems = useCallback(() => {
    itemsQuery.refetch()
  }, [itemsQuery])

  const saveSkips = useCallback(
    (skip: string[]) => {
      if (!edition) return
      setLocalSkips((current) => new Set([...current, ...skip]))
      const feedIds = skip.filter((id) => {
        const item = items.get(id)
        return item && isFeedItem(item) && !item.seenAt
      })
      markItemsSeen(feedIds).catch((error) =>
        console.log('error marking items seen', error)
      )
      updateEditionState((latest) => ({
        ...latest,
        editions: latest.editions.map((e) =>
          e.date === edition.date
            ? { ...e, skipped: Array.from(new Set([...e.skipped, ...skip])) }
            : e
        ),
      }))
        .then((next) => queryClient.setQueryData(['edition'], next))
        .catch((error) => console.log('error saving skip', error))
    },
    [edition, items, queryClient]
  )

  const later = useCallback(
    async (item: LibraryItemNode) => {
      await moveItem(item.id, item.slug)
      refreshItems()
    },
    [moveItem, refreshItems]
  )

  const setHour = useCallback(
    (hour: number) => {
      updateEditionState((latest) => ({ ...latest, hour }))
        .then((next) =>
          queryClient.setQueryData(['edition'], (current?: EditionState) =>
            current ? { ...current, hour: next.hour } : next
          )
        )
        .catch((error) => console.log('error saving edition hour', error))
    },
    [queryClient]
  )

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
      const position = order.findIndex((item) => item.id === selectedId)
      const current = order[position] ?? (selectedId ? undefined : order[0])
      switch (event.key) {
        case '/':
          event.preventDefault()
          captureRef.current?.focus()
          break
        case 'j':
          event.preventDefault()
          setSelectedId(order[Math.min(order.length - 1, position + 1)]?.id)
          break
        case 'k':
          event.preventDefault()
          setSelectedId(order[Math.max(0, position - 1)]?.id)
          break
        case 'Enter':
        case 'o':
          if (current && target === document.body) {
            event.preventDefault()
            open(current)
          }
          break
        case 'l':
          if (current && isFeedItem(current)) later(current)
          break
        case 'Backspace':
        case 'Delete':
          if (current) {
            event.preventDefault()
            setSelectedId(order[position + 1]?.id ?? order[position - 1]?.id)
            saveSkips([current.id])
          }
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [order, selectedId, open, later, saveSkips])

  useEffect(() => {
    if (!selectedId) return
    document
      .querySelector(`[data-story="${selectedId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  const timeOf = (item: LibraryItemNode) =>
    formatMinutes(readingMinutes(item.wordsCount))

  const sourceLine = (entry: Shown, label?: string) => (
    <Source>
      <SiteIcon
        src={iconOf(entry.item)}
        fallbackSrc={faviconFor(entry.item.originalArticleUrl, entry.item.url)}
        name={sourceOf(entry.item)}
        size={14}
      />
      <span>{sourceOf(entry.item)}</span>
      {(label || entry.why) && <b>· {label ?? entry.why}</b>}
    </Source>
  )

  const quietActions = (item: LibraryItemNode) => (
    <Quiet>
      {isFeedItem(item) && (
        <button
          type="button"
          title="Save to your library to read later (L)"
          aria-label="Save for later"
          onClick={() => later(item)}
        >
          <Bookmark size={15} />
        </button>
      )}
      <button
        type="button"
        title="Skip (Backspace)"
        aria-label="Skip"
        onClick={() => saveSkips([item.id])}
      >
        <X size={15} />
      </button>
    </Quiet>
  )

  const menuFor = (item: LibraryItemNode): MenuEntry[] => [
    {
      label: isDone(item) ? 'Open' : 'Read',
      shortcut: '↵',
      onSelect: () => open(item),
    },
    ...(isFeedItem(item)
      ? [
          {
            label: 'Save for later',
            shortcut: 'L',
            onSelect: () => later(item),
          },
        ]
      : []),
    {
      label: 'Skip',
      shortcut: '⌫',
      onSelect: () => saveSkips([item.id]),
    },
    ...linkEntries(item.originalArticleUrl || item.url),
  ]

  const doneMark = (item: LibraryItemNode) =>
    isDone(item) ? <Check size={13} weight="bold" aria-label="Done" /> : null

  const fallbackFor = (item: LibraryItemNode, size = 28) => (
    <Fallback>
      <SiteIcon
        src={iconOf(item)}
        fallbackSrc={faviconFor(item.originalArticleUrl, item.url)}
        name={sourceOf(item)}
        size={size}
      />
    </Fallback>
  )

  const lead = inSlot('lead')[0]
  const picks = inSlot('pick')
  const popular = inSlot('popular')
  const briefs = inSlot('brief')
  const watch = inSlot('watch')
  const remaining = fullOrder.filter((item) => !isDone(item))

  const making =
    stateQuery.isPending || (ids.length > 0 && itemsQuery.isPending)

  return (
    <Page>
      <Column>
        <Mast>
          <MastTop>
            <MastTitle>
              The Edition<em>.</em>
            </MastTitle>
            {edition && state && (
              <MastDate>
                <span>
                  <LongDate>{longDate(edition.date)}</LongDate>
                  <ShortDate>{shortDate(edition.date)}</ShortDate>
                  <br />
                  No. {edition.number}
                  <LongDate> · made at {hourLabel(state.hour)}</LongDate>
                </span>
                {state.editions.length > 1 && (
                  <Arrows>
                    <button
                      type="button"
                      aria-label="Earlier edition"
                      disabled={index >= state.editions.length - 1}
                      onClick={() => {
                        setIndex(index + 1)
                        setSelectedId(undefined)
                      }}
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="Later edition"
                      disabled={index === 0}
                      onClick={() => {
                        setIndex(index - 1)
                        setSelectedId(undefined)
                      }}
                    >
                      <ArrowRight size={14} />
                    </button>
                  </Arrows>
                )}
              </MastDate>
            )}
            <AddButton
              type="button"
              aria-label="Save a link or search"
              aria-expanded={captureOpen}
              // Keep the field focused so this tap can close it.
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
          </MastTop>
          {edition && stories.length > 0 && (
            <MastSub>
              <span>
                {index === 0 ? '' : 'An earlier edition. '}
                {edition.considered} new from {edition.sources}{' '}
                {edition.sources === 1 ? 'source' : 'sources'}, picked down to{' '}
                {stories.length} {stories.length === 1 ? 'story' : 'stories'}.
                {totalMinutes > 0 &&
                  ` About ${formatMinutes(totalMinutes)} of reading.`}
              </span>
              <Ticks aria-label={`${doneCount} of ${stories.length} done`}>
                <span>
                  {stories.map((entry, i) => (
                    <i key={entry.id} data-done={i < doneCount} />
                  ))}
                </span>
                {doneCount} OF {stories.length}
              </Ticks>
            </MastSub>
          )}
          {index === 0 && edition && stories.length > 0 && (
            <TimeRow>
              <Chips role="group" aria-label="Time you have">
                <span>I have</span>
                {BUDGETS.map((minutes) => (
                  <Chip
                    key={minutes}
                    type="button"
                    aria-pressed={budget === minutes}
                    onClick={() => {
                      setBudget(budget === minutes ? null : minutes)
                      setSelectedId(undefined)
                    }}
                  >
                    {minutes} min
                  </Chip>
                ))}
                <Chip
                  type="button"
                  aria-pressed={budget === null}
                  onClick={() => setBudget(null)}
                >
                  All of it
                </Chip>
              </Chips>
              {fitted && (
                <Fit aria-live="polite">
                  {fitted.chosen.length === 0
                    ? 'NOTHING LEFT FITS'
                    : `${fitted.chosen.length} ${
                        fitted.chosen.length === 1 ? 'STORY' : 'STORIES'
                      } · ${fitted.used} OF ${budget} MIN`}
                  <i aria-hidden="true">
                    <b
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((fitted.used / (budget ?? 1)) * 100)
                        )}%`,
                      }}
                    />
                  </i>
                </Fit>
              )}
            </TimeRow>
          )}
        </Mast>

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
            placeholder="Paste a link to save it, or search your library"
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

        {making && (
          <Making aria-label="Making today's edition">
            <Meta>Making today&apos;s edition…</Meta>
            <i style={{ height: '240px' }} />
            <i style={{ width: '70%' }} />
            <i style={{ width: '45%' }} />
          </Making>
        )}

        {stateQuery.isError && (
          <Notice>
            Stash couldn&apos;t make today&apos;s edition.
            <Btn type="button" onClick={() => stateQuery.refetch()}>
              Try again
            </Btn>
          </Notice>
        )}

        {itemsQuery.isError && (
          <Notice>
            Stash couldn&apos;t load this edition&apos;s stories.
            <Btn type="button" onClick={() => itemsQuery.refetch()}>
              Try again
            </Btn>
          </Notice>
        )}

        {!making && edition && stories.length === 0 && (
          <Notice>
            Nothing new since the last edition. Follow a few feeds or save some
            articles, and the next edition will have them.
          </Notice>
        )}

        {!making && lead && (
          <ContextMenu entries={menuFor(lead.item)}>
            <Lead
              data-story={lead.item.id}
              data-selected={selectedId === lead.item.id}
              data-done={isDone(lead.item)}
            >
              <LeadCover
                src={lead.item.headerImage ?? lead.item.image}
                fallback={fallbackFor(lead.item, 40)}
                onClick={() => open(lead.item)}
              />
              <LeadCopy>
                {sourceLine(lead, lead.why ?? 'Lead story')}
                <LeadTitle
                  type="button"
                  data-morph-title={lead.item.id}
                  onClick={() => open(lead.item)}
                >
                  {lead.item.title}
                </LeadTitle>
                {lead.item.description && <Dek>{lead.item.description}</Dek>}
                <Meta>
                  {[
                    timeOf(lead.item),
                    isFeedItem(lead.item) ? 'From your feeds' : 'Saved by you',
                    shortTimeAgo(lead.item.publishedAt || lead.item.savedAt),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Meta>
                <Actions>
                  <Btn primary type="button" onClick={() => open(lead.item)}>
                    {isDone(lead.item) ? 'Open' : 'Read'} <Kbd>↵</Kbd>
                  </Btn>
                  {isFeedItem(lead.item) && (
                    <Btn type="button" onClick={() => later(lead.item)}>
                      Later <Kbd>L</Kbd>
                    </Btn>
                  )}
                  <Btn type="button" onClick={() => saveSkips([lead.item.id])}>
                    Skip <Kbd>⌫</Kbd>
                  </Btn>
                </Actions>
              </LeadCopy>
            </Lead>
          </ContextMenu>
        )}

        {!making && picks.length > 0 && (
          <section aria-label="Picked for you">
            <SectionHead>
              <h2>Picked for you</h2>
              <span>CLOSEST TO WHAT YOU READ</span>
            </SectionHead>
            <Picks>
              {picks.map((entry) => (
                <ContextMenu key={entry.id} entries={menuFor(entry.item)}>
                  <Story
                    data-story={entry.id}
                    data-selected={selectedId === entry.id}
                    data-done={isDone(entry.item)}
                  >
                    <StoryCover
                      src={entry.item.headerImage ?? entry.item.image}
                      fallback={fallbackFor(entry.item)}
                      onClick={() => open(entry.item)}
                    />
                    {sourceLine(entry)}
                    <StoryTitle
                      type="button"
                      data-morph-title={entry.item.id}
                      onClick={() => open(entry.item)}
                    >
                      {entry.item.title}
                    </StoryTitle>
                    {entry.item.description && (
                      <StoryDek>{entry.item.description}</StoryDek>
                    )}
                    <StoryFoot>
                      <Meta>
                        {doneMark(entry.item)} {timeOf(entry.item)}
                      </Meta>
                      {quietActions(entry.item)}
                    </StoryFoot>
                  </Story>
                </ContextMenu>
              ))}
            </Picks>
          </section>
        )}

        {!making &&
          (briefs.length > 0 ||
            popular.length > 0 ||
            inProgress.length > 0 ||
            watch.length > 0) && (
            <Lower>
              <Stack>
                {popular.length > 0 && (
                  <section aria-label="Popular">
                    <SectionHead>
                      <h2>Popular</h2>
                      <span>MOST TALKED ABOUT</span>
                    </SectionHead>
                    <Brief>{popular.map((entry) => briefRow(entry))}</Brief>
                  </section>
                )}
                {briefs.length > 0 && (
                  <section aria-label="Also today">
                    <SectionHead>
                      <h2>Also today</h2>
                      <span>
                        {briefs.length} MORE{' '}
                        {briefs.length === 1 ? 'STORY' : 'STORIES'}
                      </span>
                    </SectionHead>
                    <Brief>{briefs.map((entry) => briefRow(entry))}</Brief>
                  </section>
                )}
              </Stack>
              <Stack>
                {inProgress.length > 0 && (
                  <section aria-label="Pick up again">
                    <SectionHead>
                      <h2>Pick up again</h2>
                      <span>IN PROGRESS</span>
                    </SectionHead>
                    {inProgress.map((item) => {
                      const left = minutesLeft(
                        item.wordsCount,
                        item.readingProgressPercent
                      )
                      return (
                        <Resume
                          key={item.id}
                          href={
                            viewer
                              ? `/${viewer.profile.username}/${item.slug}`
                              : undefined
                          }
                          onClick={(event) => {
                            if (event.metaKey || event.ctrlKey) return
                            event.preventDefault()
                            open(item)
                          }}
                        >
                          <Thumb
                            src={item.headerImage ?? item.image}
                            fallback={fallbackFor(item, 22)}
                          />
                          <span>
                            <strong data-morph-title={item.id}>
                              {item.title}
                            </strong>
                            <ProgressLine
                              percent={item.readingProgressPercent}
                            />
                            <ResumeMeta>
                              <span>{sourceOf(item)}</span>
                              <span>
                                {left !== undefined
                                  ? `${formatMinutes(left)} left`
                                  : `${Math.round(
                                      item.readingProgressPercent
                                    )}%`}
                              </span>
                            </ResumeMeta>
                          </span>
                        </Resume>
                      )
                    })}
                  </section>
                )}
                {watch.length > 0 && (
                  <section aria-label="Watch">
                    <SectionHead>
                      <h2>Watch</h2>
                      <span>
                        {watch.length} NEW{' '}
                        {watch.length === 1 ? 'VIDEO' : 'VIDEOS'}
                      </span>
                    </SectionHead>
                    <Videos>
                      {watch.map((entry) => (
                        <Video
                          key={entry.id}
                          type="button"
                          onClick={() => open(entry.item)}
                        >
                          <CoverImage
                            src={entry.item.image}
                            fallback={fallbackFor(entry.item)}
                          />
                          <strong data-morph-title={entry.item.id}>
                            {entry.item.title}
                          </strong>
                          <Meta>{sourceOf(entry.item)}</Meta>
                        </Video>
                      ))}
                    </Videos>
                  </section>
                )}
              </Stack>
            </Lower>
          )}

        {!making && edition && state && (
          <Colophon>
            <p>
              {stories.length > 0 &&
              itemsQuery.isSuccess &&
              remaining.length === 0
                ? "You're up to date. "
                : index === 0
                ? "That's today's edition. "
                : ''}
              The next one is made at {hourLabel(state.hour)}.
            </p>
            <label>
              New edition each day at
              <select
                id="edition-hour"
                value={state.hour}
                onChange={(event) => setHour(Number(event.target.value))}
              >
                {[4, 5, 6, 7, 8, 9, 10].map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </select>
            </label>
            {remaining.length > 0 && (
              <Btn
                type="button"
                onClick={() => saveSkips(remaining.map((item) => item.id))}
              >
                Mark the rest as seen
              </Btn>
            )}
          </Colophon>
        )}
      </Column>
    </Page>
  )

  function briefRow(entry: Shown) {
    return (
      <ContextMenu key={entry.id} entries={menuFor(entry.item)}>
        <BriefRow
          data-story={entry.id}
          data-selected={selectedId === entry.id}
          data-done={isDone(entry.item)}
        >
          <div style={{ minWidth: 0 }}>
            {sourceLine(entry)}
            <BriefTitle
              type="button"
              data-morph-title={entry.item.id}
              onClick={() => open(entry.item)}
            >
              {entry.item.title}
            </BriefTitle>
          </div>
          <BriefEnd>
            <Meta>
              {doneMark(entry.item)} {timeOf(entry.item)}
            </Meta>
            {quietActions(entry.item)}
          </BriefEnd>
        </BriefRow>
      </ContextMenu>
    )
  }
}
