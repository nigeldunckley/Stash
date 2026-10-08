import {
  ArrowSquareOut,
  ArrowUp,
  Bookmark,
  CaretDown,
  Checks,
  GearSix,
  Plus,
  Rss,
} from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useLibraryItemActions from '../../../lib/hooks/useLibraryItemActions'
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
  searchValue,
} from '../../../lib/networking/subscriptions/feeds'
import { useGetSubscriptions } from '../../../lib/networking/subscriptions/useGetSubscriptions'
import { useGetViewer } from '../../../lib/networking/viewer/useGetViewer'
import { formatMinutes, readingMinutes } from '../../../lib/readingTime'
import { siteName, timeAgo } from '../../../lib/textFormatting'
import { showErrorToast, showSuccessToast } from '../../../lib/toastHelpers'
import {
  IconButton,
  ItemList,
  ItemRow,
  PageMeta,
  PageTitle,
  Popover,
  SegmentedControl,
  SiteIcon,
  SwipeAction,
  UnseenDot,
} from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import { AddFeedPanel } from './AddFeedPanel'
import { SourceSettings } from './SourceSettings'

const Page = styled('main', {
  width: '100%',
  minHeight: '100vh',
  boxSizing: 'border-box',
  color: '$stInk',
  fontFamily: '$inter',
  padding: '24px 32px 80px',
  '@mdDown': {
    padding: 'calc(20px + env(safe-area-inset-top, 0px)) 16px 32px',
  },
})

const Panes = styled('div', {
  maxWidth: '1180px',
  margin: '0 auto',
  display: 'grid',
  gridTemplateColumns: '240px minmax(0, 1fr)',
  gap: '28px',
  alignItems: 'start',
  '@mdDown': { gridTemplateColumns: 'minmax(0, 1fr)' },
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

const Toolbar = styled('header', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
  marginBottom: '16px',
})

const TitleButton = styled('button', {
  all: 'unset',
  display: 'none',
  alignItems: 'center',
  gap: '6px',
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

const MobileSources = styled('div', {
  display: 'grid',
  gap: '2px',
  minWidth: '240px',
  maxHeight: '60vh',
  overflowY: 'auto',
})

type View = 'unseen' | 'all'

const isVisible = (item: LibraryItemNode) =>
  item.state !== State.ARCHIVED && item.state !== State.DELETED

const byName = (a: Subscription, b: Subscription) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

const sourceQuery = (subscription?: Subscription) =>
  subscription ? `subscription:${searchValue(subscription.name)}` : ''

// The unseen count for one source, shown in the sources list.
function SourceCount(props: { subscription?: Subscription }): JSX.Element {
  const query = useGetLibraryItems(
    `feeds-count-${props.subscription?.id ?? 'all'}`,
    'following',
    {
      limit: 1,
      sortDescending: true,
      searchQuery: `${sourceQuery(props.subscription)} -is:seen`.trim(),
      includeCount: true,
    },
    true,
    LIVE_CHECK * 2
  )
  const count = query.data?.pages[0]?.pageInfo.totalCount
  if (!count) {
    return <Count />
  }
  return <Count unseen>{count > 999 ? '999+' : count}</Count>
}

function SourceList(props: {
  subscriptions: Subscription[]
  selected?: Subscription
  onSelect: (subscription?: Subscription) => void
}): JSX.Element {
  return (
    <>
      <Source
        aria-current={!props.selected}
        onClick={() => props.onSelect(undefined)}
      >
        <AllIcon aria-hidden="true">
          <Rss size={11} weight="bold" />
        </AllIcon>
        <span>All feeds</span>
        <SourceCount />
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
            name={subscription.name}
            size={18}
          />
          <span>{subscription.name}</span>
          <SourceCount subscription={subscription} />
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
  const { moveItem } = useLibraryItemActions()
  const bulkAction = useBulkActions()
  const { data: allSubscriptions, isPending: subscriptionsPending } =
    useGetSubscriptions({})

  const subscriptions = useMemo(
    () =>
      (allSubscriptions ?? [])
        .filter((subscription) => subscription.status == 'ACTIVE')
        .sort(byName),
    [allSubscriptions]
  )
  const selectedId =
    typeof router.query.source == 'string' ? router.query.source : undefined
  const selected = subscriptions.find((s) => s.id == selectedId)

  const [view, setView] = useState<View>('unseen')
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

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
      window.scrollTo({ top: 0 })
    },
    [router]
  )

  const searchQuery = [
    sourceQuery(selected),
    view == 'unseen' ? '-is:seen' : '',
    'sort:saved-desc',
  ]
    .filter(Boolean)
    .join(' ')
  const itemsQuery = useGetLibraryItems(
    `feeds-${selected?.id ?? 'all'}-${view}`,
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
  const total = itemsQuery.data?.pages[0]?.pageInfo.totalCount

  // Refetching the open list would pull rows out from under the reader, so a
  // one-item query watches for newer items and offers to show them.
  const latestQuery = useGetLibraryItems(
    `feeds-latest-${selected?.id ?? 'all'}-${view}`,
    'following',
    { limit: 1, sortDescending: true, searchQuery },
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
  const hasNewItems =
    !!latestId &&
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

  // With nothing on screen there is nothing to disturb, so just show them.
  useEffect(() => {
    if (hasNewItems && items.length == 0) {
      itemsQuery.refetch()
    }
  }, [hasNewItems, items.length, itemsQuery])

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

  const save = useCallback(
    async (item: LibraryItemNode) => {
      setSeen((current) => new Set(current).add(item.id))
      await moveItem(item.id, item.slug)
    },
    [moveItem]
  )

  const openOriginal = (item: LibraryItemNode) => {
    markSeen([item.id])
    window.open(item.originalArticleUrl || item.url, '_blank', 'noreferrer')
  }

  const unseenOnScreen = items.filter((item) => !isSeen(item))
  const markAllSeen = useCallback(async () => {
    const query = `in:following use:folders ${sourceQuery(selected)} -is:seen`
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
          : 'Marked all feeds as seen',
        { position: 'bottom-right' }
      )
    } catch {
      showErrorToast('Could not mark items as seen', {
        position: 'bottom-right',
      })
    }
  }, [bulkAction, selected, view, total, items])

  // Keyboard: j and k move, o opens, s saves to the Library, v opens the
  // original page.
  const [focusId, setFocusId] = useState<string | undefined>()
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
      const index = items.findIndex((item) => item.id == focusId)
      const current = index >= 0 ? items[index] : undefined
      const move = (next?: LibraryItemNode) => {
        if (next) {
          setFocusId(next.id)
          rowRefs.current.get(next.id)?.focus()
        }
      }
      switch (event.key) {
        case 'j':
          event.preventDefault()
          if (current) markSeen([current.id])
          move(items[Math.min(items.length - 1, index + 1)])
          break
        case 'k':
          event.preventDefault()
          move(items[Math.max(0, index - 1)])
          break
        case 'o':
          if (current) open(current)
          break
        case 's':
          if (current) save(current)
          break
        case 'v':
          if (current) openOriginal(current)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const title = selected?.name ?? 'All feeds'
  const meta =
    total === undefined
      ? undefined
      : view == 'unseen'
      ? `${total} unseen`
      : `${total} items`

  const sourceList = (
    <SourceList
      subscriptions={subscriptions}
      selected={selected}
      onSelect={select}
    />
  )

  const noFeeds = !subscriptionsPending && subscriptions.length == 0

  return (
    <Page>
      <Panes>
        <Sources aria-label="Sources">
          <SourcesHeading>
            Sources
            <Popover
              label="Add a feed"
              align="start"
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <IconButton label="Add a feed" size="sm">
                  <Plus size={14} />
                </IconButton>
              }
            >
              <AddFeedPanel onDone={() => setAddOpen(false)} />
            </Popover>
          </SourcesHeading>
          {sourceList}
        </Sources>

        <section aria-label={title}>
          <Toolbar>
            <PageTitle css={{ '@mdDown': { display: 'none' } }}>
              {title}
            </PageTitle>
            <Popover
              label="Sources"
              align="start"
              open={sourcesOpen}
              onOpenChange={setSourcesOpen}
              trigger={
                <TitleButton aria-label="Choose a source">
                  <PageTitle>{title}</PageTitle>
                  <CaretDown size={16} />
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
            <SegmentedControl
              label="Show"
              value={view}
              onChange={(next) => {
                setView(next)
                setSeen(new Set())
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
              <Wide>Mark all seen</Wide>
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
                  label="Add a feed"
                  trigger={
                    <IconButton label="Add a feed">
                      <Plus size={16} />
                    </IconButton>
                  }
                >
                  <AddFeedPanel />
                </Popover>
              </span>
            )}
          </Toolbar>

          {noFeeds ? (
            <Empty>
              No feeds yet. Add a site or feed address, or import an OPML file
              from another reader.
              <div style={{ marginTop: 16, textAlign: 'left' }}>
                <AddFeedPanel />
              </div>
            </Empty>
          ) : !itemsQuery.isPending && items.length == 0 ? (
            <Empty>
              {view == 'unseen'
                ? 'You are all caught up.'
                : 'Nothing from this source yet.'}
            </Empty>
          ) : (
            <>
              {hasNewItems && (
                <NewItemsBar>
                  <button onClick={showNewItems}>
                    <ArrowUp size={13} weight="bold" />
                    New items
                  </button>
                </NewItemsBar>
              )}
              <ItemList>
                {items.map((item) => {
                  const itemSeen = isSeen(item)
                  return (
                    <SwipeAction
                      key={item.id}
                      label="Save"
                      icon={<Bookmark size={16} />}
                      onAction={() => save(item)}
                    >
                      <ItemRow
                        ref={rowRef(item.id)}
                        leading={<UnseenDot hidden={itemSeen} />}
                        title={item.title}
                        image={item.image}
                        subtitle={[
                          selected
                            ? undefined
                            : item.subscription ||
                              siteName(
                                item.originalArticleUrl,
                                item.url,
                                item.siteName
                              ),
                          item.author && item.author != item.subscription
                            ? item.author
                            : undefined,
                          timeAgo(item.publishedAt || item.savedAt),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        excerpt={item.description}
                        meta={formatMinutes(readingMinutes(item.wordsCount))}
                        muted={itemSeen}
                        selected={item.id == focusId}
                        onOpen={() => open(item)}
                        onFocus={() => setFocusId(item.id)}
                        actions={
                          <>
                            <IconButton
                              label="Save to Library"
                              shortcut="s"
                              size="sm"
                              onClick={() => save(item)}
                            >
                              <Bookmark size={15} />
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
                  )
                })}
              </ItemList>
            </>
          )}
          <div ref={sentinel} style={{ height: 1 }} />
        </section>
      </Panes>
    </Page>
  )
}
