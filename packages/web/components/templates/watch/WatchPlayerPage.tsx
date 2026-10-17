import {
  ArrowLeft,
  ArrowSquareOut,
  Check,
  Clock,
  DotsSixVertical,
} from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LibraryItemNode,
  useGetLibraryItems,
  useGetLibraryItemsByIds,
} from '../../../lib/networking/library_items/useLibraryItems'
import {
  moveItemToFolder,
  subscriptionName,
} from '../../../lib/networking/subscriptions/feeds'
import { useGetSubscriptions } from '../../../lib/networking/subscriptions/useGetSubscriptions'
import { markVideoWatched } from '../../../lib/networking/subscriptions/youtube'
import { shortTimeAgo } from '../../../lib/textFormatting'
import { showErrorToast } from '../../../lib/toastHelpers'
import {
  collectionOfItem,
  useWatchCollections,
} from '../../../lib/watch/collections'
import { useWatchLaterOrder } from '../../../lib/watch/order'
import { SPEEDS, useWatchPlayer } from '../../../lib/watch/player'
import { formatTimecode, videoSeconds } from '../../../lib/youtube'
import {
  ContextMenu,
  CoverImage,
  linkEntries,
  showUndoToast,
  SiteIcon,
  Switch,
} from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import { useMediaQuery } from '../feeds/feedRowParts'
import { ExtraTab, VideoTabs } from '../feeds/VideoPeek'
import { CollectionDot } from './Collections'
import { SubscribeChannel } from './SubscribeChannel'

const Page = styled('main', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 340px',
  alignItems: 'start',
  gap: '28px',
  maxWidth: '1320px',
  margin: '0 auto',
  padding: '20px 32px 80px',
  '@mdDown': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 0,
    padding: '0 0 60px',
  },
})

const Back = styled('button', {
  all: 'unset',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  marginBottom: '12px',
  fontFamily: '$inter',
  fontSize: '$small',
  color: '$stMuted',
  cursor: 'pointer',
  '&:hover': { color: '$stInk' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '@mdDown': { display: 'none' },
})

// The player itself floats over this box (see lib/watch/player).
const Slot = styled('div', {
  aspectRatio: '16 / 9',
  width: '100%',
  borderRadius: '12px',
  background: '#000',
  '@mdDown': { borderRadius: 0 },
})

const Body = styled('div', {
  '@mdDown': { padding: '0 16px' },
})

const Title = styled('h1', {
  margin: '16px 0 10px',
  fontFamily: '$inter',
  fontSize: '22px',
  fontWeight: 600,
  lineHeight: 1.22,
  letterSpacing: '-0.022em',
  color: '$stInk',
  textWrap: 'balance',
  '@mdDown': { fontSize: '19px', margin: '14px 0 8px' },
})

const Channel = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '10px 14px',
  paddingBottom: '14px',
  marginBottom: '4px',
  borderBottom: '1px solid $stLine',
})

const Who = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minWidth: 0,
  marginRight: 'auto',
  '& b': {
    display: 'block',
    fontFamily: '$inter',
    fontSize: '$body',
    fontWeight: 500,
    color: '$stInk',
  },
  '& small': {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: '$mono',
    fontSize: '$micro',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    color: '$stMuted',
  },
})

const Actions = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px',
  '& > div': { margin: 0 },
})

const Action = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '30px',
  padding: '0 11px',
  border: '1px solid $stLineStrong',
  borderRadius: '$sm',
  background: '$stSurface',
  fontFamily: '$inter',
  fontSize: '$caption',
  fontWeight: 500,
  color: '$stInk',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: `background ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  '&[aria-pressed="true"]': { color: '$stAccentText' },
  '& kbd': {
    fontFamily: '$mono',
    fontSize: '$micro',
    color: '$stMuted',
  },
  '@mdDown': { height: '34px' },
})

const Aside = styled('aside', {
  position: 'sticky',
  top: '20px',
  maxHeight: 'calc(100vh - 40px)',
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid $stLine',
  borderRadius: '12px',
  background: '$stSurface',
  overflow: 'hidden',
  '@mdDown': { display: 'none' },
})

const AsideHead = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px 8px',
  fontFamily: '$inter',
  fontSize: '$body',
  fontWeight: 600,
  color: '$stInk',
  '& label': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '$caption',
    fontWeight: 400,
    color: '$stMuted',
  },
})

const Queue = styled('ol', {
  listStyle: 'none',
  margin: 0,
  padding: '0 6px 6px',
  overflowY: 'auto',
  '@mdDown': { padding: 0 },
})

const QueueGroup = styled('li', {
  padding: '10px 8px 4px',
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '$stMuted',
})

const Entry = styled('li', {
  display: 'grid',
  gridTemplateColumns: '14px 112px minmax(0, 1fr)',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 8px 6px 2px',
  borderRadius: '$sm',
  cursor: 'pointer',
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-2px' },
  '&[data-drop="true"]': { boxShadow: 'inset 0 2px 0 $colors$stAccent' },
  '& > span:first-child': {
    color: '$stMuted',
    cursor: 'grab',
    display: 'grid',
    placeItems: 'center',
  },
  '@mdDown': {
    gridTemplateColumns: '0 128px minmax(0, 1fr)',
    gap: '12px',
    padding: '8px 0',
    borderRadius: 0,
    '& > span:first-child': { visibility: 'hidden' },
  },
})

const Thumb = styled('div', {
  position: 'relative',
  aspectRatio: '16 / 9',
  borderRadius: '6px',
  overflow: 'hidden',
  background: '$stSunken',
  '& > span': {
    position: 'absolute',
    right: '4px',
    bottom: '4px',
    padding: '1px 4px',
    borderRadius: '3px',
    background: 'rgba(0, 0, 0, 0.78)',
    color: '#fff',
    fontFamily: '$mono',
    fontSize: '10px',
  },
})

const EntryText = styled('div', {
  minWidth: 0,
  '& b': {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontFamily: '$inter',
    fontSize: '$small',
    fontWeight: 500,
    lineHeight: 1.3,
    color: '$stInk',
  },
  '& small': {
    display: 'block',
    marginTop: '3px',
    fontFamily: '$mono',
    fontSize: '$micro',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    color: '$stMuted',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
})

const Keys = styled('div', {
  padding: '10px 14px',
  borderTop: '1px solid $stLine',
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '$stMuted',
})

const Empty = styled('p', {
  margin: 0,
  padding: '14px',
  fontFamily: '$inter',
  fontSize: '$small',
  color: '$stMuted',
})

const UP_NEXT_LATER = 'type:video -is:read sort:saved-asc'

// A full page for watching: the video, its channel and actions, chapters and
// description, and Up next (Watch later first, then new videos from the same
// collection) which plays on by itself.
export function WatchPlayerPage(props: { id: string }): JSX.Element {
  const router = useRouter()
  const queryClient = useQueryClient()
  const player = useWatchPlayer()
  const isPhone = useMediaQuery('(max-width: 768px)')
  const { data: subscriptions } = useGetSubscriptions({})
  const { collections } = useWatchCollections()

  const fetched = useGetLibraryItemsByIds('watch-player', [props.id])
  const loaded = fetched.data?.pages[0]?.edges[0]?.node
  const item = player.item?.id == props.id ? player.item : loaded

  // Start the video when the page opens on it (from a link or a reload).
  const started = useRef<string>()
  useEffect(() => {
    if (item && started.current != item.id && player.item?.id != item.id) {
      started.current = item.id
      player.play(item)
    }
  }, [item, player])

  // When Up next moves on by itself, the address follows.
  useEffect(() => {
    if (player.item && player.item.id != props.id && player.docked) {
      router.replace(
        { pathname: '/l/watch', query: { v: player.item.id } },
        undefined,
        { shallow: true }
      )
    }
  }, [player.item, player.docked, props.id, router])

  // The player sits over the slot while this page is open.
  const { setSlot } = player
  const slotRef = useCallback(
    (element: HTMLDivElement | null) => setSlot(element),
    [setSlot]
  )
  useEffect(() => () => setSlot(null), [setSlot])

  const collection = item
    ? collectionOfItem(item, collections, subscriptions)
    : undefined
  const laterQuery = useGetLibraryItems('watch-upnext-later', 'inbox', {
    limit: 30,
    sortDescending: true,
    searchQuery: UP_NEXT_LATER,
  })
  const moreQuery = useGetLibraryItems(
    `watch-upnext-${collection?.id ?? 'all'}`,
    'following',
    {
      limit: 20,
      sortDescending: true,
      searchQuery: `type:video -is:seen -is:read ${
        collection ? `collection:${collection.id} ` : ''
      }sort:published-desc`,
    }
  )
  const laterItems = useMemo(
    () => (laterQuery.data?.pages[0]?.edges ?? []).map((edge) => edge.node),
    [laterQuery.data]
  )
  const { sorted: later, move } = useWatchLaterOrder(laterItems)
  const more = useMemo(() => {
    const queued = new Set(later.map((i) => i.id))
    return (moreQuery.data?.pages[0]?.edges ?? [])
      .map((edge) => edge.node)
      .filter((node) => !queued.has(node.id))
  }, [moreQuery.data, later])
  const upNext = useMemo(
    () => [...later, ...more].filter((node) => node.id != item?.id),
    [later, more, item?.id]
  )

  // Autoplay plays from this list, even after leaving the page.
  const { setQueue } = player
  useEffect(() => setQueue(upNext), [upNext, setQueue])

  const channelName = (node: LibraryItemNode) =>
    subscriptionName(node.subscription, subscriptions) || node.author || ''
  const channel = subscriptions?.find((s) => s.url == item?.subscription)

  const goBack = useCallback(() => {
    const back = window.localStorage.getItem('nav-return')
    router.push(back && back.startsWith('/l/watch') ? back : '/l/watch')
  }, [router])

  const playFromList = (node: LibraryItemNode) => {
    player.play(node)
    router.replace({ pathname: '/l/watch', query: { v: node.id } }, undefined, {
      shallow: true,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const inLater = item?.folder == 'inbox'
  const [queued, setQueued] = useState(false)
  const addToLater = async () => {
    if (!item || inLater || queued) return
    setQueued(true)
    try {
      await moveItemToFolder(item.id, 'inbox')
      queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
      showUndoToast('Added to Watch later')
    } catch {
      setQueued(false)
      showErrorToast('Could not add to Watch later')
    }
  }

  const [watchedNow, setWatchedNow] = useState<boolean>()
  const watched =
    watchedNow ?? (item ? (item.readingProgressPercent ?? 0) > 98 : false)
  const toggleWatched = async () => {
    if (!item) return
    const next = !watched
    setWatchedNow(next)
    try {
      await markVideoWatched(item.id, next)
      queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
    } catch {
      setWatchedNow(!next)
      showErrorToast('Could not change it')
    }
  }
  useEffect(() => setWatchedNow(undefined), [item?.id])

  const cycleSpeed = () => {
    const index = SPEEDS.indexOf(player.state.rate)
    player.setRate(SPEEDS[(index + 1) % SPEEDS.length])
  }

  // Space or K plays and pauses, J and L skip 10 seconds (as on YouTube),
  // Shift+N plays the next video, < and > change speed, Escape goes back.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target.closest('input, textarea, select, [contenteditable="true"]') ||
        document.querySelector('[role="dialog"], [role="menu"]')
      ) {
        return
      }
      const speed = (step: number) => {
        const index = Math.max(0, SPEEDS.indexOf(player.state.rate))
        const next =
          SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, index + step))]
        player.setRate(next)
      }
      switch (event.key) {
        case ' ':
        case 'k':
          if (event.key == ' ' && target.closest('button, a')) return
          event.preventDefault()
          player.toggle()
          break
        case 'j':
        case 'ArrowLeft':
          event.preventDefault()
          player.skip(-10)
          break
        case 'l':
        case 'ArrowRight':
          event.preventDefault()
          player.skip(10)
          break
        case 'N':
          if (event.shiftKey) player.next()
          break
        case '<':
          speed(-1)
          break
        case '>':
          speed(1)
          break
        case 'Escape':
          goBack()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [player, goBack])

  // Dragging in Watch later reorders it (on a Mac).
  const [dragging, setDragging] = useState<string>()
  const [dropOn, setDropOn] = useState<string>()

  const entry = (node: LibraryItemNode) => {
    const queuedLater = later.some((l) => l.id == node.id)
    const seconds = videoSeconds(node.wordsCount)
    const nodeCollection = collectionOfItem(node, collections, subscriptions)
    return (
      <ContextMenu
        key={node.id}
        entries={[
          { label: 'Play now', onSelect: () => playFromList(node) },
          ...(queuedLater
            ? [
                {
                  label: 'Play next',
                  onSelect: () => move(node.id, upNext[0]?.id ?? null),
                },
              ]
            : []),
          ...linkEntries(node.originalArticleUrl || node.url),
        ]}
      >
        <Entry
          tabIndex={0}
          role="button"
          aria-label={`Play ${node.title}`}
          data-drop={dropOn == node.id && dragging != node.id}
          draggable={queuedLater && !isPhone}
          onDragStart={(event) => {
            setDragging(node.id)
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', node.id)
          }}
          onDragEnd={() => {
            setDragging(undefined)
            setDropOn(undefined)
          }}
          onDragOver={(event) => {
            if (!dragging || !queuedLater) return
            event.preventDefault()
            setDropOn(node.id)
          }}
          onDrop={(event) => {
            event.preventDefault()
            if (dragging && dragging != node.id) move(dragging, node.id)
            setDragging(undefined)
            setDropOn(undefined)
          }}
          onClick={() => playFromList(node)}
          onKeyDown={(event) => {
            if (event.key == 'Enter') playFromList(node)
          }}
        >
          <span aria-hidden="true">
            {queuedLater && <DotsSixVertical size={14} />}
          </span>
          <Thumb>
            <CoverImage src={node.headerImage || node.image} />
            {seconds && <span>{formatTimecode(seconds)}</span>}
          </Thumb>
          <EntryText>
            <b>{node.title}</b>
            <small>
              {[
                channelName(node),
                queuedLater ? 'Watch later' : nodeCollection?.name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </EntryText>
        </Entry>
      </ContextMenu>
    )
  }

  const queueList = (
    <Queue aria-label="Up next">
      {upNext.length == 0 && (
        <Empty>
          Nothing queued. Add videos to Watch later and they play here next.
        </Empty>
      )}
      {upNext.map((node, index) => {
        const first = index == 0
        const firstMore = index == later.filter((l) => l.id != item?.id).length
        return [
          first && later.some((l) => l.id == node.id) ? (
            <QueueGroup key="g-later">Watch later</QueueGroup>
          ) : null,
          firstMore && !later.some((l) => l.id == node.id) ? (
            <QueueGroup key="g-more">
              {collection ? `New in ${collection.name}` : 'New videos'}
            </QueueGroup>
          ) : null,
          entry(node),
        ]
      })}
    </Queue>
  )

  const autoplaySwitch = (
    <label>
      Autoplay
      <Switch
        label="Autoplay"
        checked={player.autoplay}
        onChange={player.setAutoplay}
      />
    </label>
  )

  const phoneTabs: ExtraTab[] = isPhone
    ? [
        {
          id: 'upnext',
          label: 'Up next',
          content: (
            <>
              <AsideHead css={{ padding: '4px 0 6px' }}>
                <span />
                {autoplaySwitch}
              </AsideHead>
              {queueList}
            </>
          ),
        },
      ]
    : []

  if (!item) {
    return (
      <Page>
        <div>
          <Back onClick={goBack}>
            <ArrowLeft size={14} /> Watch
          </Back>
          <Slot />
          <Body>
            <Title>
              {fetched.isPending ? '' : 'This video is no longer in Stash.'}
            </Title>
          </Body>
        </div>
      </Page>
    )
  }

  const published = item.publishedAt || item.savedAt
  const duration = player.state.duration || videoSeconds(item.wordsCount) || 0

  return (
    <Page>
      <div>
        <Back onClick={goBack}>
          <ArrowLeft size={14} /> Watch
        </Back>
        <Slot ref={slotRef} />
        <Body>
          <Title>{item.title}</Title>
          <Channel>
            <Who>
              <SiteIcon
                src={channel?.icon}
                name={channelName(item)}
                size={34}
                round
              />
              <div>
                <b>{channelName(item)}</b>
                <small>
                  {[
                    published ? shortTimeAgo(published) : undefined,
                    duration ? formatTimecode(duration) : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {collection && (
                    <>
                      {' · '}
                      <CollectionDot css={{ background: collection.color }} />
                      {collection.name}
                    </>
                  )}
                </small>
              </div>
            </Who>
            <Actions>
              <SubscribeChannel item={item} channelName={channelName(item)} />
              <Action
                onClick={cycleSpeed}
                title="Playback speed (< and >)"
                aria-label={`Speed ${player.state.rate}×`}
              >
                {player.state.rate}×
              </Action>
              {!inLater && (
                <Action aria-pressed={queued} onClick={addToLater}>
                  <Clock size={14} weight={queued ? 'fill' : 'regular'} />
                  {queued ? 'In Watch later' : 'Watch later'}
                </Action>
              )}
              <Action aria-pressed={watched} onClick={toggleWatched}>
                <Check size={14} weight="bold" />
                {watched ? 'Watched' : 'Mark watched'}
              </Action>
              <Action
                as="a"
                href={item.originalArticleUrl || item.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Open on YouTube"
                title="Open on YouTube"
              >
                <ArrowSquareOut size={14} />
              </Action>
            </Actions>
          </Channel>
          <VideoTabs
            key={item.id}
            item={item}
            time={player.state.time}
            playing={player.state.playing}
            onSeek={player.seek}
            extra={phoneTabs}
          />
        </Body>
      </div>
      <Aside aria-label="Up next">
        <AsideHead>
          Up next
          {autoplaySwitch}
        </AsideHead>
        {queueList}
        <Keys>Space play · J/L 10s · ⇧N next · &lt; &gt; speed</Keys>
      </Aside>
    </Page>
  )
}
