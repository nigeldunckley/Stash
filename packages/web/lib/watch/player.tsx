// One YouTube player for the whole app. The player page gives it a slot to
// sit over; anywhere else it shrinks to a mini player, so a video keeps
// playing while you read or triage feeds. The iframe is never moved in the
// page (that would reload it), only placed over wherever it should appear.

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/router'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { LibraryItemNode } from '../networking/library_items/useLibraryItems'
import { markItemsSeen } from '../networking/subscriptions/feeds'
import {
  markVideoWatched,
  saveVideoPosition,
} from '../networking/subscriptions/youtube'
import { styled } from '../../components/tokens/stitches.config'
import { videoIdFromUrl, videoSeconds } from '../youtube'

export const PLAYER_ORIGIN = 'https://www.youtube-nocookie.com'

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2]

// A video counts as watched once this much of it has played.
const WATCHED_AT = 0.9

export type PlayerState = {
  time: number
  duration: number
  playing: boolean
  ended: boolean
  rate: number
}

type Player = {
  item?: LibraryItemNode
  state: PlayerState
  queue: LibraryItemNode[]
  autoplay: boolean
  // True while the player page shows the video full size.
  docked: boolean
  play: (item: LibraryItemNode) => void
  setQueue: (items: LibraryItemNode[]) => void
  setAutoplay: (on: boolean) => void
  next: () => void
  toggle: () => void
  pause: () => void
  seek: (seconds: number) => void
  skip: (seconds: number) => void
  setRate: (rate: number) => void
  close: () => void
  setSlot: (element: HTMLElement | null) => void
}

const PlayerContext = createContext<Player | undefined>(undefined)

export function useWatchPlayer(): Player {
  const player = useContext(PlayerContext)
  if (!player) throw new Error('useWatchPlayer needs WatchPlayerProvider')
  return player
}

// Where each video was left this visit, so reopening one picks up there even
// before the lists have heard about it.
export const positions = new Map<string, number>()

const RATES_KEY = 'watch-rates'
const AUTOPLAY_KEY = 'watch-autoplay'

const readStore = <T,>(key: string, fallback: T): T => {
  try {
    const value = window.localStorage.getItem(key)
    return value === null ? fallback : (JSON.parse(value) as T)
  } catch {
    return fallback
  }
}
const writeStore = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is unavailable; the choice lasts until the page closes.
  }
}

// Speed is remembered per channel: a lecture at 1.75×, a film at 1×.
const channelKey = (item: LibraryItemNode) =>
  item.subscription || item.author || 'other'
const rateFor = (item: LibraryItemNode) =>
  readStore<Record<string, number>>(RATES_KEY, {})[channelKey(item)] ?? 1

// Start where the viewer left off, unless that was the very end.
export const startFor = (item: LibraryItemNode) => {
  const at = positions.get(item.id) ?? item.readingProgressAnchorIndex ?? 0
  const known = videoSeconds(item.wordsCount)
  return known && at > known - 15 ? 0 : at
}

const IDLE: PlayerState = {
  time: 0,
  duration: 0,
  playing: false,
  ended: false,
  rate: 1,
}

export function WatchPlayerProvider(props: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [item, setItem] = useState<LibraryItemNode>()
  const [state, setState] = useState<PlayerState>(IDLE)
  const [queue, setQueue] = useState<LibraryItemNode[]>([])
  const [autoplay, setAutoplayState] = useState(true)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [src, setSrc] = useState<string>()
  const frame = useRef<HTMLIFrameElement>(null)
  const ready = useRef(false)

  useEffect(() => setAutoplayState(readStore(AUTOPLAY_KEY, true)), [])
  const setAutoplay = useCallback((on: boolean) => {
    setAutoplayState(on)
    writeStore(AUTOPLAY_KEY, on)
  }, [])

  const post = useCallback((func: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      PLAYER_ORIGIN
    )
  }, [])

  // Saves where the current video is, so it resumes there anywhere.
  const saved = useRef({ id: '', time: 0 })
  const latest = useRef({ item, state })
  latest.current = { item, state }
  const savePosition = useCallback(() => {
    const { item, state } = latest.current
    if (!item || !state.duration) return
    if (Math.abs(state.time - saved.current.time) < 2) return
    saved.current = { id: item.id, time: state.time }
    saveVideoPosition(item.id, state.time, state.duration).catch(
      () => undefined
    )
  }, [])

  const play = useCallback(
    (next: LibraryItemNode) => {
      const videoId = videoIdFromUrl(next.originalArticleUrl || next.url)
      if (!videoId) return
      if (latest.current.item?.id == next.id) {
        post('playVideo')
        return
      }
      savePosition()
      const start = Math.floor(startFor(next))
      saved.current = { id: next.id, time: start }
      setItem(next)
      setState({ ...IDLE, time: start, rate: rateFor(next) })
      markItemsSeen([next.id]).catch(() => undefined)
      if (ready.current && frame.current) {
        post('loadVideoById', [{ videoId, startSeconds: start }])
      } else {
        const params = new URLSearchParams({
          autoplay: '1',
          playsinline: '1',
          rel: '0',
          enablejsapi: '1',
          origin: window.location.origin,
        })
        if (start > 0) params.set('start', String(start))
        setSrc(`${PLAYER_ORIGIN}/embed/${videoId}?${params}`)
      }
    },
    [post, savePosition]
  )

  const close = useCallback(() => {
    savePosition()
    post('pauseVideo')
    ready.current = false
    setItem(undefined)
    setSrc(undefined)
    setState(IDLE)
  }, [post, savePosition])

  const queueRef = useRef(queue)
  queueRef.current = queue
  const next = useCallback(() => {
    const current = latest.current.item
    const upcoming = queueRef.current.find((q) => q.id != current?.id)
    if (upcoming) play(upcoming)
  }, [play])

  // The player reports its time, state and speed once asked to listen.
  const onLoad = () => {
    ready.current = true
    frame.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: 'stash' }),
      PLAYER_ORIGIN
    )
  }
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin != PLAYER_ORIGIN ||
        event.source != frame.current?.contentWindow
      ) {
        return
      }
      let data: {
        event?: string
        info?: {
          currentTime?: number
          duration?: number
          playerState?: number
          playbackRate?: number
        }
      }
      try {
        data =
          typeof event.data == 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (data?.event == 'onReady') {
        // Apply the channel's speed as soon as the player can take it.
        const item = latest.current.item
        if (item) post('setPlaybackRate', [rateFor(item)])
        return
      }
      const info = data?.info
      if (data?.event != 'infoDelivery' || !info) return
      setState((current) => ({
        time: info.currentTime ?? current.time,
        duration: info.duration || current.duration,
        playing:
          info.playerState === undefined
            ? current.playing
            : info.playerState == 1,
        ended:
          info.playerState === undefined
            ? current.ended
            : info.playerState == 0,
        rate: info.playbackRate ?? current.rate,
      }))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [post])

  // Every so often while watching, remember the place; at 90% the video
  // counts as watched; at the end the next one starts.
  const watched = useRef(new Set<string>())
  useEffect(() => {
    if (!item) return
    positions.set(item.id, state.time)
    if (Math.abs(state.time - saved.current.time) >= 10) savePosition()
    if (
      state.duration &&
      state.time / state.duration >= WATCHED_AT &&
      !watched.current.has(item.id)
    ) {
      watched.current.add(item.id)
      markVideoWatched(item.id)
        .then(() =>
          queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
        )
        .catch(() => undefined)
    }
  }, [item, state.time, state.duration, savePosition, queryClient])
  useEffect(() => {
    if (state.ended && autoplay) next()
  }, [state.ended, autoplay, next])

  // Save the place when the page is hidden or closed.
  useEffect(() => {
    const onHide = () => savePosition()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [savePosition])

  const toggle = useCallback(
    () => post(latest.current.state.playing ? 'pauseVideo' : 'playVideo'),
    [post]
  )
  const pause = useCallback(() => post('pauseVideo'), [post])
  const seek = useCallback(
    (seconds: number) => {
      const target = Math.max(0, seconds)
      post('seekTo', [target, true])
      post('playVideo')
      setState((current) => ({ ...current, time: target, ended: false }))
    },
    [post]
  )
  const skip = useCallback(
    (seconds: number) => seek(latest.current.state.time + seconds),
    [seek]
  )
  const setRate = useCallback(
    (rate: number) => {
      post('setPlaybackRate', [rate])
      setState((current) => ({ ...current, rate }))
      const item = latest.current.item
      if (item) {
        const rates = readStore<Record<string, number>>(RATES_KEY, {})
        writeStore(RATES_KEY, { ...rates, [channelKey(item)]: rate })
      }
    },
    [post]
  )

  const value = useMemo<Player>(
    () => ({
      item,
      state,
      queue,
      autoplay,
      docked: !!slot,
      play,
      setQueue,
      setAutoplay,
      next,
      toggle,
      pause,
      seek,
      skip,
      setRate,
      close,
      setSlot,
    }),
    [
      item,
      state,
      queue,
      autoplay,
      slot,
      play,
      setAutoplay,
      next,
      toggle,
      pause,
      seek,
      skip,
      setRate,
      close,
    ]
  )

  return (
    <PlayerContext.Provider value={value}>
      {props.children}
      {item && src && (
        <PlayerDock slot={slot}>
          <iframe
            ref={frame}
            src={src}
            title={item.title}
            onLoad={onLoad}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </PlayerDock>
      )}
    </PlayerContext.Provider>
  )
}

// The mini player's video: a card's top on a Mac, the left end of a slim bar
// under the top bar on iPhone. MiniPlayer draws the controls around it.
export const MINI = {
  width: 320,
  height: 180,
  bar: 52,
  margin: 20,
  phoneBar: 56,
  phoneVideo: 100,
}

const MiniFrame = styled('div', {
  position: 'fixed',
  zIndex: 60,
  right: MINI.margin,
  bottom: MINI.margin + MINI.bar,
  width: MINI.width,
  height: MINI.height,
  borderRadius: '12px 12px 0 0',
  overflow: 'hidden',
  background: '#000',
  '@mdDown': {
    right: 'auto',
    left: 0,
    bottom: 'auto',
    top: 'calc(48px + env(safe-area-inset-top, 0px))',
    width: MINI.phoneVideo,
    height: MINI.phoneBar,
    borderRadius: 0,
  },
  '& iframe': {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    border: 0,
  },
})

// Places the player over the page's slot, following it as the page scrolls
// and resizes. With no slot it becomes the mini player.
function PlayerDock(props: {
  slot: HTMLElement | null
  children: ReactNode
}): JSX.Element {
  const [rect, setRect] = useState<DOMRect>()
  useEffect(() => {
    const slot = props.slot
    if (!slot) {
      setRect(undefined)
      return
    }
    let frame = 0
    let last = ''
    const follow = () => {
      const next = slot.getBoundingClientRect()
      const key = `${next.top},${next.left},${next.width},${next.height}`
      if (key != last) {
        last = key
        setRect(next)
      }
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [props.slot])

  return (
    <MiniFrame
      data-watch-player={props.slot && rect ? 'docked' : 'mini'}
      // Inline, so it beats the mini player's styles on any screen size.
      style={
        props.slot && rect
          ? {
              top: rect.top,
              left: rect.left,
              right: 'auto',
              bottom: 'auto',
              width: rect.width,
              height: rect.height,
              zIndex: 5,
              borderRadius: rect.width < 700 && rect.left < 1 ? 0 : 12,
            }
          : undefined
      }
    >
      {props.children}
    </MiniFrame>
  )
}

// Opens a video on the player page.
export function useOpenVideo() {
  const router = useRouter()
  const player = useWatchPlayer()
  return useCallback(
    (item: LibraryItemNode) => {
      player.play(item)
      window.localStorage.setItem('nav-return', router.asPath)
      router.push({ pathname: '/l/watch', query: { v: item.id } })
    },
    [router, player]
  )
}
