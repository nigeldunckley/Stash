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
import {
  discoveryIssue,
  isSaturday,
  recommendedFor,
  verdictsDue,
} from '../../../lib/edition/discovery'
import { useFeedSuggestions } from '../../../lib/networking/feedSuggestions'
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
import { navigateWithMorph } from '../../../lib/viewTransition'

import {
  Actions,
  AddButton,
  Arrows,
  Brief,
  BriefEnd,
  BriefRow,
  BriefTitle,
  Btn,
  CaptureForm,
  Chip,
  Chips,
  Colophon,
  Column,
  Dek,
  Fallback,
  Fit,
  Lead,
  LeadCopy,
  LeadCover,
  LeadTitle,
  LongDate,
  Lower,
  Making,
  Mast,
  MastDate,
  MastSub,
  MastTitle,
  MastTop,
  Meta,
  Notice,
  Page,
  Picks,
  Quiet,
  Resume,
  ResumeMeta,
  SectionHead,
  ShortDate,
  Source,
  Stack,
  Story,
  StoryCover,
  StoryDek,
  StoryFoot,
  StoryTitle,
  Thumb,
  Ticks,
  TimeRow,
  Video,
  Videos,
} from './editionStyles'
import {
  DiscoveryEdition,
  RecommendedBand,
  TrialVerdict,
  Verdicts,
} from './EditionDiscovery'

// Home: The Edition, a front page made once a day. See lib/edition/engine.ts
// for how stories are chosen.

// Time you have, in minutes; null is the whole edition.
const BUDGETS = [5, 15, 45] as const
const minutesOf = (item: LibraryItemNode) =>
  readingMinutes(item.wordsCount) ?? 4
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

  // From Discover: one recommended story a day, The Discovery Edition on
  // Saturdays, and verdicts on trials whose week is up. Only today's edition
  // carries them, and each keeps its stories once shown so following one
  // doesn't swap it for another.
  const { data: discover } = useFeedSuggestions()
  const suggestions = useMemo(() => discover?.suggestions ?? [], [discover])
  const today = index === 0 && edition ? edition.date : undefined
  const saturday = !!today && isSaturday(today)
  const [shownIds, setShownIds] = useState<{
    date: string
    recommended?: string
    issue?: { lead: string; picks: string[]; writers: string[] }
  }>()
  useEffect(() => {
    if (!today || !discover || shownIds?.date === today) return
    const recommended = saturday
      ? undefined
      : recommendedFor(today, suggestions)
    const issue = saturday ? discoveryIssue(suggestions) : undefined
    setShownIds({
      date: today,
      recommended: recommended?.id,
      issue: issue && {
        lead: issue.lead.id,
        picks: issue.picks.map((s) => s.id),
        writers: issue.writers.map((s) => s.id),
      },
    })
  }, [today, saturday, discover, suggestions, shownIds])
  const byId = useCallback(
    (id: string) => suggestions.find((s) => s.id === id),
    [suggestions]
  )
  const recommended =
    shownIds?.date === today && shownIds?.recommended
      ? byId(shownIds.recommended)
      : undefined
  const issueLead =
    shownIds?.date === today && shownIds?.issue
      ? byId(shownIds.issue.lead)
      : undefined
  const issue =
    issueLead && shownIds?.issue
      ? {
          lead: issueLead,
          picks: shownIds.issue.picks
            .map(byId)
            .filter((s): s is NonNullable<typeof s> => !!s),
          writers: shownIds.issue.writers
            .map(byId)
            .filter((s): s is NonNullable<typeof s> => !!s),
        }
      : undefined
  const verdicts = today ? verdictsDue(suggestions) : []

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
                {stories.length} {stories.length === 1 ? 'story' : 'stories'}
                {recommended ? ', plus one recommended for you' : ''}.
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
            verdicts.length > 0 ||
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
                {verdicts.length > 0 && (
                  <section aria-label="Trials">
                    <SectionHead>
                      <h2>
                        {verdicts.length > 1 ? 'Your trials' : 'Your trial'}
                      </h2>
                      <span>A WEEK IN YOUR FEEDS</span>
                    </SectionHead>
                    <Verdicts>
                      {verdicts.map((s) => (
                        <TrialVerdict key={s.id} s={s} />
                      ))}
                    </Verdicts>
                  </section>
                )}
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

        {!making && recommended && <RecommendedBand suggestion={recommended} />}

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
              {issue
                ? 'The Discovery Edition follows.'
                : `The next one is made at ${hourLabel(state.hour)}.`}
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

        {!making && issue && edition && state && (
          <DiscoveryEdition
            date={edition.date}
            hour={state.hour}
            issue={issue}
            articles={discover?.articlesConsidered ?? 0}
            feeds={suggestions.filter((s) => s.status === 'NEW').length}
            following={
              suggestions.filter((s) => s.status === 'FOLLOWING').length
            }
            trying={suggestions.filter((s) => s.status === 'TRIAL')}
          />
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
