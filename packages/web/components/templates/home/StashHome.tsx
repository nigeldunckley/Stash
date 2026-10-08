import { Archive, Bookmark, Plus, Tag, Trash } from '@phosphor-icons/react'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { locale, timeZone } from '../../../lib/dateFormatting'
import { useHandleAddUrl } from '../../../lib/hooks/useHandleAddUrl'
import useLibraryItemActions from '../../../lib/hooks/useLibraryItemActions'
import { State } from '../../../lib/networking/fragments/articleFragment'
import {
  LibraryItem,
  LibraryItemNode,
  useGetLibraryItems,
} from '../../../lib/networking/library_items/useLibraryItems'
import { useGetViewer } from '../../../lib/networking/viewer/useGetViewer'
import { formatMinutes, minutesLeft } from '../../../lib/readingTime'
import {
  markItemsSeen,
  subscriptionName,
} from '../../../lib/networking/subscriptions/feeds'
import { useGetSubscriptions } from '../../../lib/networking/subscriptions/useGetSubscriptions'
import { faviconFor, shortTimeAgo, siteName } from '../../../lib/textFormatting'
import {
  CoverImage,
  IconButton,
  ItemList,
  ItemRow,
  Kbd,
  PageMeta,
  PageTitle,
  ProgressLine,
  ProgressRing,
  SectionHeader,
  SiteIcon,
  SwipeAction,
  UnseenDot,
} from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import { SetPageLabelsModalPresenter } from '../article/SetLabelsModalPresenter'

const Page = styled('main', {
  width: '100%',
  minHeight: '100vh',
  boxSizing: 'border-box',
  background: 'transparent',
  color: '$stInk',
  fontFamily: '$inter',
  padding: '24px 32px 80px',
  '@mdDown': {
    padding: 'calc(20px + env(safe-area-inset-top, 0px)) 16px 32px',
  },
})

const Column = styled('div', {
  maxWidth: '880px',
  margin: '0 auto',
  display: 'grid',
  gap: '28px',
})

const Toolbar = styled('header', {
  display: 'flex',
  alignItems: 'baseline',
  gap: '12px',
  flexWrap: 'wrap',
})

const Section = styled('section', {
  display: 'grid',
  gap: '10px',
})

const CaptureForm = styled('form', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '0 12px',
  height: '42px',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$md',
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
})

const ContinueGrid = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '10px',
  '@lgDown': {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    '& > :nth-child(3)': { display: 'none' },
  },
  '@smDown': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    '& > :nth-child(2)': { display: 'none' },
  },
})

const ContinueCard = styled('a', {
  display: 'grid',
  gap: '10px',
  padding: '12px',
  minWidth: 0,
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$md',
  color: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  overflow: 'hidden',
  transition: `border-color ${motion.fast}`,
  '&:hover': { borderColor: '$stLineStrong' },
  '&:hover img': { transform: 'scale(1.02)' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
})

// The article's header image across the top of a Continue reading card.
const CardCover = styled(CoverImage, {
  margin: '-12px -12px 2px',
  aspectRatio: '16 / 9',
  borderBottom: '1px solid $stLine',
  '&::after': { display: 'none' },
  img: { transition: `opacity ${motion.base}, transform ${motion.slow}` },
})

const CoverFallback = styled('span', {
  display: 'grid',
  placeItems: 'center',
  width: '100%',
  height: '100%',
})

const CardSource = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '$stMuted',
  span: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
})

const CardTitle = styled('div', {
  fontSize: '$body',
  fontWeight: 600,
  lineHeight: 1.3,
  letterSpacing: '-0.01em',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const CardMeta = styled('div', {
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
})

const Empty = styled('div', {
  padding: '28px 16px',
  textAlign: 'center',
  fontSize: '$small',
  color: '$stMuted',
  background: '$stSurface',
  border: '1px dashed $stLine',
  borderRadius: '$md',
})

const isVisible = (item: LibraryItemNode) =>
  item.state !== State.ARCHIVED && item.state !== State.DELETED

const flatten = (pages?: { edges: LibraryItem[] }[]): LibraryItemNode[] =>
  (pages ?? [])
    .flatMap((page) => page.edges)
    .map((edge) => edge.node)
    .filter(isVisible)

const sourceOf = (item: LibraryItemNode) =>
  siteName(item.originalArticleUrl, item.url, item.siteName)

// The source at the start of a feed row's subtitle, with its favicon.
const RowSource = styled('span', {
  '& > span:first-child': { verticalAlign: '-3px', marginRight: '6px' },
})

const isUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const todayLabel = () =>
  new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

export function StashHome(): JSX.Element {
  const router = useRouter()
  const { data: viewer } = useGetViewer()
  const addUrl = useHandleAddUrl()
  const { archiveItem, deleteItem, moveItem } = useLibraryItemActions()

  const continueQuery = useGetLibraryItems('home-continue', 'inbox', {
    limit: 3,
    sortDescending: true,
    searchQuery: 'is:reading sort:read-desc',
  })
  const { data: subscriptions } = useGetSubscriptions({})
  const feedsQuery = useGetLibraryItems(
    'home-feeds',
    'following',
    {
      limit: 5,
      sortDescending: true,
      // The same items as the Unseen view in Feeds, newest first.
      searchQuery: '-is:seen sort:published-desc',
      includeCount: true,
    },
    true,
    // New feed items arrive in the background; check for them every two minutes.
    2 * 60 * 1000
  )
  const recentQuery = useGetLibraryItems('home-recent', 'inbox', {
    limit: 15,
    sortDescending: true,
    searchQuery: 'sort:saved-desc',
  })
  const unreadQuery = useGetLibraryItems('home-unread', 'inbox', {
    limit: 1,
    sortDescending: true,
    searchQuery: 'is:unread',
    includeCount: true,
  })

  const inProgress = useMemo(
    () => flatten(continueQuery.data?.pages),
    [continueQuery.data]
  )
  const feedItems = useMemo(
    () => flatten(feedsQuery.data?.pages),
    [feedsQuery.data]
  )
  const feedName = (item: LibraryItemNode) =>
    subscriptionName(item.subscription, subscriptions) || sourceOf(item)
  const feedIcon = (item: LibraryItemNode) =>
    subscriptions?.find(
      (subscription) =>
        subscription.url == item.subscription ||
        subscription.name == item.subscription
    )?.icon || item.siteIcon
  const recent = useMemo(() => {
    const started = new Set(inProgress.map((item) => item.id))
    return flatten(recentQuery.data?.pages).filter(
      (item) => !started.has(item.id)
    )
  }, [recentQuery.data, inProgress])

  const unreadCount = unreadQuery.data?.pages[0]?.pageInfo.totalCount
  const unseenFeedCount = feedsQuery.data?.pages[0]?.pageInfo.totalCount

  // Rows reachable by keyboard: feed items, then recently saved.
  const rows = useMemo(() => [...feedItems, ...recent], [feedItems, recent])
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [labelsTarget, setLabelsTarget] = useState<
    LibraryItemNode | undefined
  >()
  const captureRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  const open = useCallback(
    (item: LibraryItemNode) => {
      const username = viewer?.profile.username
      if (!username) {
        return
      }
      window.localStorage.setItem('nav-return', router.asPath)
      if (item.state === State.PROCESSING) {
        router.push(`/article?url=${encodeURIComponent(item.url)}`)
      } else {
        router.push(`/${username}/${item.slug}`)
      }
    },
    [router, viewer]
  )

  // Opening a feed item counts it as seen, as it does in Feeds, so it leaves
  // New from feeds.
  const openFeedItem = useCallback(
    (item: LibraryItemNode) => {
      markItemsSeen([item.id]).catch((error) =>
        console.log('error marking item seen', error)
      )
      open(item)
    },
    [open]
  )

  const select = useCallback((id: string | undefined) => {
    setSelectedId(id)
    if (id) {
      rowRefs.current.get(id)?.focus({ preventScroll: false })
    }
  }, [])

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
      const index = rows.findIndex((row) => row.id === selectedId)
      const current = index >= 0 ? rows[index] : undefined
      switch (event.key) {
        case '/':
          event.preventDefault()
          captureRef.current?.focus()
          break
        case 'j':
          event.preventDefault()
          select(rows[Math.min(rows.length - 1, index + 1)]?.id)
          break
        case 'k':
          event.preventDefault()
          select(rows[Math.max(0, index - 1)]?.id)
          break
        case 'o':
          if (current) open(current)
          break
        case 'e':
          if (current && current.folder !== 'following') {
            archiveItem(current.id, current.slug)
          }
          break
        case 's':
          if (current && current.folder === 'following') {
            moveItem(current.id, current.slug)
          }
          break
        case 'l':
          if (current) setLabelsTarget(current)
          break
        case '#':
          if (current) deleteItem(current.id, current.slug, () => undefined)
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rows, selectedId, select, open, archiveItem, moveItem, deleteItem])

  const [capture, setCapture] = useState('')
  const submitCapture = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      const value = capture.trim()
      if (!value) {
        return
      }
      if (isUrl(value)) {
        setCapture('')
        await addUrl(value, timeZone, locale)
      } else {
        router.push(`/l/search?q=${encodeURIComponent(value)}`)
      }
    },
    [capture, addUrl, router]
  )

  const loaded =
    !continueQuery.isPending && !feedsQuery.isPending && !recentQuery.isPending
  const nothingAtAll =
    loaded && !inProgress.length && !feedItems.length && !recent.length

  const summary = [
    todayLabel(),
    unreadCount !== undefined ? `${unreadCount} unread` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  const rowRef = (id: string) => (element: HTMLDivElement | null) => {
    if (element) rowRefs.current.set(id, element)
    else rowRefs.current.delete(id)
  }

  return (
    <Page>
      <Column>
        <Toolbar>
          <PageTitle>Home</PageTitle>
          <PageMeta>{summary}</PageMeta>
        </Toolbar>

        <CaptureForm onSubmit={submitCapture} role="search">
          <Plus size={16} aria-hidden="true" />
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
          />
          <Kbd>/</Kbd>
        </CaptureForm>

        {nothingAtAll && (
          <Empty>
            Nothing here yet. Paste a link above, or use the Stash extension or
            bookmarklet to save what you want to read.
          </Empty>
        )}

        {inProgress.length > 0 && (
          <Section aria-label="Continue reading">
            <SectionHeader
              title="Continue reading"
              meta={`${inProgress.length} in progress`}
            />
            <ContinueGrid>
              {inProgress.map((item) => {
                const source = sourceOf(item)
                return (
                  <ContinueCard
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
                    <CardCover
                      src={item.headerImage ?? item.image}
                      fallback={
                        <CoverFallback>
                          <SiteIcon
                            src={item.siteIcon}
                            name={source}
                            size={28}
                          />
                        </CoverFallback>
                      }
                    />
                    <CardSource>
                      <SiteIcon src={item.siteIcon} name={source} size={14} />
                      <span>{source}</span>
                    </CardSource>
                    <CardTitle>{item.title}</CardTitle>
                    <ProgressLine percent={item.readingProgressPercent} />
                    <CardMeta>
                      {minutesLeft(
                        item.wordsCount,
                        item.readingProgressPercent
                      ) !== undefined
                        ? `${formatMinutes(
                            minutesLeft(
                              item.wordsCount,
                              item.readingProgressPercent
                            )
                          )} left`
                        : `${Math.round(item.readingProgressPercent)}% read`}
                    </CardMeta>
                  </ContinueCard>
                )
              })}
            </ContinueGrid>
          </Section>
        )}

        {feedItems.length > 0 && (
          <Section aria-label="New from feeds">
            <SectionHeader
              title="New from feeds"
              meta={
                unseenFeedCount !== undefined
                  ? `${unseenFeedCount} new`
                  : undefined
              }
              action={<a href="/l/subscriptions">Open Feeds</a>}
            />
            <ItemList>
              {feedItems.map((item) => (
                <SwipeAction
                  key={item.id}
                  label="Save"
                  icon={<Bookmark size={16} />}
                  onAction={() => moveItem(item.id, item.slug)}
                >
                  <ItemRow
                    ref={rowRef(item.id)}
                    leading={<UnseenDot />}
                    title={item.title}
                    image={item.image}
                    subtitle={
                      <RowSource>
                        <SiteIcon
                          src={feedIcon(item)}
                          fallbackSrc={faviconFor(
                            item.originalArticleUrl,
                            item.url
                          )}
                          name={feedName(item)}
                          size={14}
                        />
                        {feedName(item)}
                      </RowSource>
                    }
                    meta={
                      <time dateTime={item.publishedAt || item.savedAt}>
                        {shortTimeAgo(item.publishedAt || item.savedAt)}
                      </time>
                    }
                    selected={item.id === selectedId}
                    onOpen={() => openFeedItem(item)}
                    onFocus={() => setSelectedId(item.id)}
                    actions={
                      <IconButton
                        label="Save to Library"
                        shortcut="s"
                        size="sm"
                        onClick={() => moveItem(item.id, item.slug)}
                      >
                        <Bookmark size={15} />
                      </IconButton>
                    }
                  />
                </SwipeAction>
              ))}
            </ItemList>
          </Section>
        )}

        {recent.length > 0 && (
          <Section aria-label="Recently saved">
            <SectionHeader
              title="Recently saved"
              meta="newest first"
              action={<a href="/l/library">Library</a>}
            />
            <ItemList>
              {recent.map((item) => {
                const source = sourceOf(item)
                return (
                  <SwipeAction
                    key={item.id}
                    label="Archive"
                    icon={<Archive size={16} />}
                    onAction={() => archiveItem(item.id, item.slug)}
                  >
                    <ItemRow
                      ref={rowRef(item.id)}
                      leading={<SiteIcon src={item.siteIcon} name={source} />}
                      title={item.title}
                      image={item.image}
                      subtitle={[item.author, source]
                        .filter(Boolean)
                        .join(' · ')}
                      meta={
                        <>
                          {formatMinutes(
                            minutesLeft(
                              item.wordsCount,
                              item.readingProgressPercent
                            )
                          )}
                          <ProgressRing percent={item.readingProgressPercent} />
                        </>
                      }
                      selected={item.id === selectedId}
                      onOpen={() => open(item)}
                      onFocus={() => setSelectedId(item.id)}
                      actions={
                        <>
                          <IconButton
                            label="Archive"
                            shortcut="e"
                            size="sm"
                            onClick={() => archiveItem(item.id, item.slug)}
                          >
                            <Archive size={15} />
                          </IconButton>
                          <IconButton
                            label="Labels"
                            shortcut="l"
                            size="sm"
                            onClick={() => setLabelsTarget(item)}
                          >
                            <Tag size={15} />
                          </IconButton>
                          <IconButton
                            label="Delete"
                            shortcut="#"
                            size="sm"
                            onClick={() =>
                              deleteItem(item.id, item.slug, () => undefined)
                            }
                          >
                            <Trash size={15} />
                          </IconButton>
                        </>
                      }
                    />
                  </SwipeAction>
                )
              })}
            </ItemList>
          </Section>
        )}
      </Column>
      {labelsTarget && (
        <SetPageLabelsModalPresenter
          libraryItem={labelsTarget}
          onOpenChange={() => setLabelsTarget(undefined)}
        />
      )}
    </Page>
  )
}
