import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  X,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { someoneNew, verdictsDue } from '../../../lib/edition/discovery'
import type { Edition, EditionEntry } from '../../../lib/edition/engine'
import { loadThisWeeksEdition } from '../../../lib/edition/store'
import { useUpdateEdition, withDate } from '../../../lib/edition/useEdition'
import { hourLabel, nextIssueAt, weekStart } from '../../../lib/edition/weekly'
import useLibraryItemActions from '../../../lib/hooks/useLibraryItemActions'
import { State } from '../../../lib/networking/fragments/articleFragment'
import { useFeedSuggestions } from '../../../lib/networking/feedSuggestions'
import {
  LibraryItemNode,
  useGetLibraryItemsByIds,
} from '../../../lib/networking/library_items/useLibraryItems'
import {
  markItemsSeen,
  subscriptionName,
} from '../../../lib/networking/subscriptions/feeds'
import { useGetSubscriptions } from '../../../lib/networking/subscriptions/useGetSubscriptions'
import { useGetViewer } from '../../../lib/networking/viewer/useGetViewer'
import { formatMinutes, readingMinutes } from '../../../lib/readingTime'
import { faviconFor, siteName } from '../../../lib/textFormatting'
import { showErrorToast } from '../../../lib/toastHelpers'
import { navigateWithMorph } from '../../../lib/viewTransition'
import {
  ContextMenu,
  Kbd,
  linkEntries,
  MenuEntry,
  showUndoToast,
  SiteIcon,
} from '../../elements/stash'
import {
  Actions,
  Arrows,
  Btn,
  Colophon,
  Column,
  Dek,
  Fallback,
  Kicker,
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
  Quote,
  Quotes,
  SectionHead,
  Shelf,
  ShelfCopy,
  ShelfFoot,
  ShelfRow,
  ShelfThumb,
  ShelfTitle,
  ShortDate,
  Source,
  Stack,
  Stats,
  Story,
  StoryCover,
  StoryDek,
  StoryFoot,
  StoryTitle,
  Ticks,
} from './editionStyles'
import { SomeoneNew, TrialVerdict, Verdicts } from './EditionDiscovery'

// The Edition: a weekly issue, out from Saturday morning until the end of
// Sunday. It carries only what Home doesn't: the week's stories you missed,
// old saves, highlights worth seeing again, someone new to read, and your
// week in reading. See lib/edition/engine.ts for how stories are chosen.

const isFeedItem = (item: LibraryItemNode) => item.folder === 'following'

const dayOf = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options)

const longDate = (date: string) =>
  dayOf(date, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const shortDate = (date: string) =>
  dayOf(date, { weekday: 'short', day: 'numeric', month: 'short' })

const weekday = (date?: string) =>
  date
    ? new Date(date).toLocaleDateString(undefined, { weekday: 'long' })
    : undefined

// "Saved 14 July · 3 months ago"
const savedAgo = (date: string | undefined, now: Date) => {
  if (!date) return 'Saved a while ago'
  const then = new Date(date)
  const days = Math.max(0, Math.round((now.getTime() - then.getTime()) / 864e5))
  const ago =
    days < 7
      ? `${days} days ago`
      : days < 45
      ? `${Math.round(days / 7)} weeks ago`
      : days < 365
      ? `${Math.round(days / 30)} months ago`
      : `${Math.round(days / 365)} ${days < 730 ? 'year' : 'years'} ago`
  const when = then.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: then.getFullYear() == now.getFullYear() ? undefined : 'numeric',
  })
  return `Saved ${when} · ${ago}`
}

const SLOT_ORDER = ['lead', 'missed', 'shelf'] as const

export function StashEdition(): JSX.Element {
  const router = useRouter()
  const { data: viewer } = useGetViewer()
  const { moveItem } = useLibraryItemActions()
  const updateEdition = useUpdateEdition()
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
    queryFn: () => loadThisWeeksEdition(sourceOf),
    enabled: !subscriptionsPending,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
  const state = stateQuery.data

  // Which stored issue is on screen: 0 is the latest.
  const [index, setIndex] = useState(0)
  const edition: Edition | undefined = state?.editions[index]
  const latest = index === 0

  // Opening the latest issue takes its strip off Home.
  useEffect(() => {
    if (!edition || !latest || !state || state.opened.includes(edition.date)) {
      return
    }
    updateEdition((s) => ({ opened: withDate(s.opened, edition.date) })).catch(
      (error) => console.log('error saving opened issue', error)
    )
  }, [edition, latest, state, updateEdition])

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
  const inSlot = (slot: EditionEntry['slot']) =>
    shown.filter((s) => s.slot === slot)

  // From Discover: someone new, and verdicts on trials whose week is up.
  // Only the latest issue carries them, and it keeps the ones it first showed
  // so trying one doesn't swap it for another.
  const { data: discover } = useFeedSuggestions()
  const suggestions = useMemo(() => discover?.suggestions ?? [], [discover])
  const [newcomerIds, setNewcomerIds] = useState<{
    date: string
    ids: string[]
  }>()
  useEffect(() => {
    if (!latest || !edition || !discover) return
    if (newcomerIds?.date === edition.date) return
    setNewcomerIds({
      date: edition.date,
      ids: someoneNew(suggestions).map((s) => s.id),
    })
  }, [latest, edition, discover, suggestions, newcomerIds])
  const newcomers =
    latest && newcomerIds && newcomerIds.date === edition?.date
      ? newcomerIds.ids
          .map((id) => suggestions.find((s) => s.id === id))
          .filter((s): s is NonNullable<typeof s> => !!s)
      : []
  const verdicts = latest && edition ? verdictsDue(suggestions) : []

  const stories = edition?.entries ?? []
  const doneCount = stories.filter((entry) => {
    const item = items.get(entry.id)
    return skipped.has(entry.id) || (item ? isDone(item) : false)
  }).length
  const totalMinutes = shown.reduce(
    (sum, s) => sum + (readingMinutes(s.item.wordsCount) ?? 4),
    0
  )

  // Keyboard order: lead, the rest of the missed stories, then the shelf.
  const order = useMemo(
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

  const openSlug = useCallback(
    (slug: string) => {
      const username = viewer?.profile.username
      if (!username) return
      window.localStorage.setItem('nav-return', router.asPath)
      router.push(`/${username}/${slug}`)
    },
    [router, viewer]
  )

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
      updateEdition((latest) => ({
        editions: latest.editions.map((e) =>
          e.date === edition.date
            ? { ...e, skipped: Array.from(new Set([...e.skipped, ...skip])) }
            : e
        ),
      })).catch((error) => console.log('error saving skip', error))
    },
    [edition, items, updateEdition]
  )

  const later = useCallback(
    async (item: LibraryItemNode) => {
      await moveItem(item.id, item.slug)
      itemsQuery.refetch()
    },
    [moveItem, itemsQuery]
  )

  // Marking the issue read puts The Edition away until the next one.
  const isRead = !!edition && !!state?.read.includes(edition.date)
  const markRead = useCallback(async () => {
    if (!edition) return
    const date = edition.date
    try {
      await updateEdition((s) => ({
        read: withDate(s.read, date),
        opened: withDate(s.opened, date),
      }))
      showUndoToast(
        'The Edition is put away until the next issue',
        async () => {
          try {
            await updateEdition((s) => ({
              read: s.read.filter((d) => d !== date),
            }))
            router.push('/l/edition')
          } catch {
            showErrorToast('Could not bring it back')
          }
        }
      )
      router.push('/l/home')
    } catch {
      showErrorToast('Could not mark the issue read')
    }
  }, [edition, updateEdition, router])

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

  const sourceLine = (item: LibraryItemNode, label?: string) => (
    <Source>
      <SiteIcon
        src={iconOf(item)}
        fallbackSrc={faviconFor(item.originalArticleUrl, item.url)}
        name={sourceOf(item)}
        size={14}
      />
      <span>{sourceOf(item)}</span>
      {label && <b>· {label}</b>}
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
  const missed = inSlot('missed')
  const shelf = inSlot('shelf')
  const quotes = edition?.quotes ?? []
  const week = edition?.week
  const now = new Date()
  const next = state ? nextIssueAt(now, state) : undefined
  const nextLabel = next
    ? `${next.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })} at ${hourLabel(next.getHours())}`
    : undefined

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
                  <LongDate>
                    {' · Week of '}
                    {weekStart(edition.date).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'long',
                    })}
                  </LongDate>
                </span>
                {state.editions.length > 1 && (
                  <Arrows>
                    <button
                      type="button"
                      aria-label="Earlier issue"
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
                      aria-label="Later issue"
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
          </MastTop>
          {edition && stories.length > 0 && (
            <MastSub>
              <span>
                {latest ? '' : 'An earlier issue. '}
                Picked from {edition.considered}{' '}
                {edition.considered === 1 ? 'story' : 'stories'} you didn&apos;t
                get to, and your shelf. {stories.length}{' '}
                {stories.length === 1 ? 'story' : 'stories'}
                {totalMinutes > 0 &&
                  `, about ${formatMinutes(totalMinutes)} of reading`}
                .
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
        </Mast>

        {making && (
          <Making aria-label="Making this week's issue">
            <Meta>Making this week&apos;s issue…</Meta>
            <i style={{ height: '240px' }} />
            <i style={{ width: '70%' }} />
            <i style={{ width: '45%' }} />
          </Making>
        )}

        {stateQuery.isError && (
          <Notice>
            Stash couldn&apos;t make this week&apos;s issue.
            <Btn type="button" onClick={() => stateQuery.refetch()}>
              Try again
            </Btn>
          </Notice>
        )}

        {itemsQuery.isError && (
          <Notice>
            Stash couldn&apos;t load this issue&apos;s stories.
            <Btn type="button" onClick={() => itemsQuery.refetch()}>
              Try again
            </Btn>
          </Notice>
        )}

        {!making && state && !edition && (
          <Notice>
            The first weekly Edition comes out {nextLabel}. It brings the
            week&apos;s best stories you missed, old saves worth another look,
            your highlights and your week in reading.
          </Notice>
        )}

        {!making && edition && shown.length === 0 && quotes.length === 0 && (
          <Notice>
            A quiet week: nothing you missed and nothing waiting on your shelf.
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
                <Kicker>The week&apos;s best you missed</Kicker>
                {sourceLine(
                  lead.item,
                  weekday(lead.item.publishedAt || lead.item.savedAt)
                )}
                <LeadTitle
                  type="button"
                  data-morph-title={lead.item.id}
                  onClick={() => open(lead.item)}
                >
                  {lead.item.title}
                </LeadTitle>
                {lead.item.description && <Dek>{lead.item.description}</Dek>}
                <Meta>
                  {[timeOf(lead.item), lead.why].filter(Boolean).join(' · ')}
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

        {!making && missed.length > 0 && (
          <section aria-label="Also missed this week">
            <SectionHead>
              <h2>Also missed this week</h2>
              <span>FROM YOUR FEEDS, UNOPENED</span>
            </SectionHead>
            <Picks>
              {missed.map((entry) => (
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
                    {sourceLine(entry.item, entry.why)}
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
                        {doneMark(entry.item)}{' '}
                        {[
                          timeOf(entry.item),
                          weekday(entry.item.publishedAt || entry.item.savedAt),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Meta>
                      {quietActions(entry.item)}
                    </StoryFoot>
                  </Story>
                </ContextMenu>
              ))}
            </Picks>
          </section>
        )}

        {!making && (shelf.length > 0 || quotes.length > 0) && (
          <Lower>
            {shelf.length > 0 && (
              <Stack>
                <section aria-label="From the back of the shelf">
                  <SectionHead>
                    <h2>From the back of the shelf</h2>
                    <span>SAVED, NEVER OPENED</span>
                  </SectionHead>
                  <Shelf>
                    {shelf.map((entry) => (
                      <ContextMenu key={entry.id} entries={menuFor(entry.item)}>
                        <ShelfRow
                          data-story={entry.id}
                          data-selected={selectedId === entry.id}
                          data-done={isDone(entry.item)}
                        >
                          <ShelfThumb
                            src={entry.item.headerImage ?? entry.item.image}
                            fallback={fallbackFor(entry.item, 22)}
                            onClick={() => open(entry.item)}
                          />
                          <ShelfCopy>
                            <Kicker>
                              {savedAgo(
                                entry.item.savedAt || entry.item.createdAt,
                                now
                              )}
                            </Kicker>
                            <ShelfTitle
                              type="button"
                              data-morph-title={entry.item.id}
                              onClick={() => open(entry.item)}
                            >
                              {entry.item.title}
                            </ShelfTitle>
                            <ShelfFoot>
                              <Meta>
                                {doneMark(entry.item)}{' '}
                                {[sourceOf(entry.item), timeOf(entry.item)]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </Meta>
                              {quietActions(entry.item)}
                            </ShelfFoot>
                          </ShelfCopy>
                        </ShelfRow>
                      </ContextMenu>
                    ))}
                  </Shelf>
                </section>
              </Stack>
            )}
            {quotes.length > 0 && (
              <Stack>
                <section aria-label="Your highlights">
                  <SectionHead>
                    <h2>Your highlights</h2>
                    <span>BROUGHT BACK</span>
                  </SectionHead>
                  <Quotes>
                    {quotes.map((quote) => (
                      <Quote key={quote.id}>
                        <blockquote>{quote.quote}</blockquote>
                        <figcaption>
                          <a
                            href={
                              viewer
                                ? `/${viewer.profile.username}/${quote.slug}`
                                : undefined
                            }
                            onClick={(event) => {
                              if (event.metaKey || event.ctrlKey) return
                              event.preventDefault()
                              openSlug(quote.slug)
                            }}
                          >
                            {[
                              quote.source,
                              quote.title,
                              dayOf(quote.createdAt.slice(0, 10), {
                                month: 'long',
                              }),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </a>
                        </figcaption>
                      </Quote>
                    ))}
                  </Quotes>
                </section>
              </Stack>
            )}
          </Lower>
        )}

        {!making && newcomers.length > 0 && (
          <section aria-label="Someone new">
            <SectionHead>
              <h2>Someone new</h2>
              <span>NOT IN YOUR FEEDS YET</span>
            </SectionHead>
            <SomeoneNew suggestions={newcomers} />
          </section>
        )}

        {!making && verdicts.length > 0 && (
          <section aria-label="Trials">
            <SectionHead>
              <h2>{verdicts.length > 1 ? 'Your trials' : 'Your trial'}</h2>
              <span>A WEEK IN YOUR FEEDS</span>
            </SectionHead>
            <Verdicts>
              {verdicts.map((s) => (
                <TrialVerdict key={s.id} s={s} />
              ))}
            </Verdicts>
          </section>
        )}

        {!making && edition && week && (
          <section aria-label="Your week in reading">
            <SectionHead css={{ borderTop: 'none', paddingTop: 0 }}>
              <h2>Your week in reading</h2>
              <span>
                {weekStart(edition.date).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })}
                {' – '}
                {dayOf(edition.date, { day: 'numeric', month: 'short' })}
              </span>
            </SectionHead>
            <Stats>
              <div>
                <dt>
                  {week.finished === 1
                    ? 'Article finished'
                    : 'Articles finished'}
                </dt>
                <dd>{week.finished}</dd>
              </div>
              <div>
                <dt>Time reading</dt>
                <dd>{formatMinutes(week.minutes) ?? '0 min'}</dd>
              </div>
              <div>
                <dt>Highlights</dt>
                <dd>{week.highlights}</dd>
              </div>
              {week.topSource && (
                <div>
                  <dt>Most read</dt>
                  <dd title={week.topSource}>{week.topSource}</dd>
                </div>
              )}
              {week.longest && (
                <div>
                  <dt>Longest read</dt>
                  <dd title={week.longest.title}>
                    {formatMinutes(week.longest.minutes)}
                  </dd>
                </div>
              )}
            </Stats>
          </section>
        )}

        {!making && edition && (
          <Colophon>
            <p>
              {latest ? "That's this week's Edition. " : ''}
              {nextLabel && `The next one comes out ${nextLabel}.`}
            </p>
            {latest &&
              (isRead ? (
                <Meta>Marked read</Meta>
              ) : (
                <Btn primary type="button" onClick={markRead}>
                  <Check size={14} weight="bold" />
                  Mark as read
                </Btn>
              ))}
          </Colophon>
        )}
      </Column>
    </Page>
  )
}
