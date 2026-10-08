import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LibraryItemNode } from '../../../lib/networking/library_items/useLibraryItems'
import { saveVideoPosition } from '../../../lib/networking/subscriptions/youtube'
import { shortTimeAgo } from '../../../lib/textFormatting'
import {
  chaptersFromDescription,
  descriptionWithoutChapters,
  formatTimecode,
  videoIdFromUrl,
  videoSeconds,
} from '../../../lib/youtube'
import { reducedMotion } from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { keyframes, styled } from '../../tokens/stitches.config'

const PLAYER_ORIGIN = 'https://www.youtube-nocookie.com'

// Where each video was left this visit, so reopening one picks up there even
// before the list has heard about it.
const positions = new Map<string, number>()

const Frame = styled('div', {
  position: 'relative',
  margin: '14px 14px 0',
  aspectRatio: '16 / 9',
  borderRadius: '10px',
  overflow: 'hidden',
  background: '#000',
  '& iframe': {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    border: 0,
  },
  '@mdDown': { margin: '12px 12px 0' },
  variants: {
    // Edge to edge in the phone sheet.
    flush: {
      true: { margin: 0, borderRadius: 0, '@mdDown': { margin: 0 } },
    },
  },
})

const Body = styled('div', {
  padding: '18px 24px 0',
  '@mdDown': { padding: '16px 18px 0' },
})

const Title = styled('h2', {
  margin: '0 0 9px',
  fontFamily: '$inter',
  fontSize: '21px',
  fontWeight: 600,
  lineHeight: 1.22,
  letterSpacing: '-0.022em',
  color: '$stInk',
  textWrap: 'balance',
})

const Meta = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 12px',
  paddingBottom: '14px',
  borderBottom: '1px solid $stLine',
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  color: '$stMuted',
  fontVariantNumeric: 'tabular-nums',
})

const Tabs = styled('div', {
  display: 'flex',
  gap: '16px',
  borderBottom: '1px solid $stLine',
  marginBottom: '10px',
  '& button': {
    all: 'unset',
    cursor: 'pointer',
    padding: '10px 0 9px',
    marginBottom: '-1px',
    borderBottom: '1.5px solid transparent',
    fontFamily: '$inter',
    fontSize: '$small',
    color: '$stMuted',
    transition: `color ${motion.fast}`,
    '&:hover': { color: '$stInk' },
    '&[aria-selected="true"]': {
      color: '$stInk',
      fontWeight: 500,
      borderColor: '$stInk',
    },
    '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  },
})

const Chapters = styled('ol', {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: '1px',
})

const bars = keyframes({
  '0%, 100%': { height: '3px' },
  '50%': { height: '10px' },
})

const Chapter = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'grid',
  gridTemplateColumns: '56px minmax(0, 1fr) 12px',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '7px 8px',
  borderRadius: '$sm',
  cursor: 'pointer',
  fontFamily: '$inter',
  fontSize: '$small',
  color: '$stInk2',
  transition: `background ${motion.fast}, color ${motion.fast}`,
  '&:hover': { background: '$stSunken', color: '$stInk' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-2px' },
  '& > span:first-child': {
    fontFamily: '$mono',
    fontSize: '$micro',
    color: '$stMuted',
    fontVariantNumeric: 'tabular-nums',
  },
  '&[aria-current="true"]': {
    background: '$stSunken',
    color: '$stInk',
    fontWeight: 500,
    '& > span:first-child': { color: '$stAccentText' },
  },
})

// Three bars that move while the chapter plays.
const Playing = styled('span', {
  display: 'flex',
  alignItems: 'flex-end',
  gap: '1.5px',
  height: '10px',
  '& i': {
    width: '2px',
    height: '6px',
    borderRadius: '1px',
    background: '$stAccent',
    animation: `${bars} 1s ease-in-out infinite`,
    [reducedMotion]: { animation: 'none' },
  },
  '& i:nth-child(2)': { animationDelay: '-0.3s' },
  '& i:nth-child(3)': { animationDelay: '-0.6s' },
  variants: {
    paused: { true: { '& i': { animationPlayState: 'paused' } } },
  },
})

const About = styled('div', {
  fontFamily: '$inter',
  fontSize: '$body',
  lineHeight: 1.6,
  color: '$stInk2',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  '& a': {
    color: '$stInk',
    textDecoration: 'underline',
    textDecorationColor: '$stLineStrong',
    textUnderlineOffset: '2px',
  },
  '& button': {
    all: 'unset',
    cursor: 'pointer',
    fontFamily: '$mono',
    fontSize: '0.88em',
    color: '$stAccentText',
  },
})

// Links and timecodes in a description become clickable.
function DescriptionText(props: {
  text: string
  onSeek: (seconds: number) => void
}): JSX.Element {
  const parts = props.text.split(
    /(https?:\/\/[^\s]+|\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)/g
  )
  return (
    <>
      {parts.map((part, index) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={index} href={part} target="_blank" rel="noreferrer">
              {part.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          )
        }
        if (/^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(part)) {
          const seconds = part
            .split(':')
            .map(Number)
            .reduce((total, value) => total * 60 + value, 0)
          return (
            <button key={index} onClick={() => props.onSeek(seconds)}>
              {part}
            </button>
          )
        }
        return part
      })}
    </>
  )
}

type PlayerState = { time: number; duration: number; playing: boolean }

// Talks to YouTube's embedded player over postMessage: it reports the time
// once asked to, and takes seek commands.
function usePlayer(
  frame: React.RefObject<HTMLIFrameElement>,
  videoId: string
): [PlayerState, (seconds: number) => void] {
  const [state, setState] = useState<PlayerState>({
    time: positions.get(videoId) ?? 0,
    duration: 0,
    playing: false,
  })

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
        info?: { currentTime?: number; duration?: number; playerState?: number }
      }
      try {
        data =
          typeof event.data == 'string' ? JSON.parse(event.data) : event.data
      } catch {
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
      }))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [frame])

  const seek = useCallback(
    (seconds: number) => {
      const post = (func: string, args: unknown[] = []) =>
        frame.current?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func, args }),
          PLAYER_ORIGIN
        )
      post('seekTo', [seconds, true])
      post('playVideo')
      setState((current) => ({ ...current, time: seconds }))
    },
    [frame]
  )

  return [state, seek]
}

// The video in the Watch pane or sheet: YouTube's player, title, chapters and
// description. Where the viewer stops is saved so the video resumes there.
export function PeekVideo(props: {
  item: LibraryItemNode
  channelName: string
  flush?: boolean
}): JSX.Element {
  const { item } = props
  const videoId = videoIdFromUrl(item.originalArticleUrl || item.url) ?? ''
  const frame = useRef<HTMLIFrameElement>(null)
  const knownSeconds = videoSeconds(item.wordsCount)

  // Start where the viewer left off, unless that was the very end.
  const [start] = useState(() => {
    const at = positions.get(videoId) ?? item.readingProgressAnchorIndex ?? 0
    return knownSeconds && at > knownSeconds - 15 ? 0 : at
  })
  const src = useMemo(() => {
    const params = new URLSearchParams({
      autoplay: '1',
      playsinline: '1',
      rel: '0',
      enablejsapi: '1',
      origin: typeof window == 'undefined' ? '' : window.location.origin,
    })
    if (start > 0) params.set('start', String(Math.floor(start)))
    return `${PLAYER_ORIGIN}/embed/${videoId}?${params}`
  }, [videoId, start])

  const [player, seek] = usePlayer(frame, videoId)
  const duration = player.duration || knownSeconds || 0

  // Ask the player to report its time once it has loaded.
  const listen = () => {
    frame.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: videoId }),
      PLAYER_ORIGIN
    )
  }

  // Save the position every so often while watching, and when leaving.
  const saved = useRef(start)
  const latest = useRef({ time: start, duration })
  latest.current = { time: player.time, duration }
  useEffect(() => {
    positions.set(videoId, player.time)
    if (Math.abs(player.time - saved.current) >= 10 && duration) {
      saved.current = player.time
      saveVideoPosition(item.id, player.time, duration).catch(() => undefined)
    }
  }, [player.time, duration, videoId, item.id])
  useEffect(
    () => () => {
      const { time, duration } = latest.current
      if (Math.abs(time - saved.current) >= 2 && duration) {
        saveVideoPosition(item.id, time, duration).catch(() => undefined)
      }
    },
    [item.id]
  )

  const chapters = useMemo(
    () => chaptersFromDescription(item.description),
    [item.description]
  )
  const about = useMemo(
    () => descriptionWithoutChapters(item.description),
    [item.description]
  )
  const [tab, setTab] = useState<'chapters' | 'about'>(
    chapters.length ? 'chapters' : 'about'
  )
  const current = chapters.reduce(
    (found, chapter, index) => (player.time >= chapter.start ? index : found),
    -1
  )
  const published = item.publishedAt || item.savedAt

  return (
    <>
      <Frame flush={props.flush}>
        {videoId && (
          <iframe
            ref={frame}
            src={src}
            title={item.title}
            onLoad={listen}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}
      </Frame>
      <Body>
        <Title>{item.title}</Title>
        <Meta>
          <span>{props.channelName}</span>
          {duration > 0 && <span>{formatTimecode(duration)}</span>}
          {published && <span>{shortTimeAgo(published)}</span>}
        </Meta>
        {chapters.length > 0 && (
          <Tabs role="tablist" aria-label="Video details">
            <button
              role="tab"
              aria-selected={tab == 'chapters'}
              onClick={() => setTab('chapters')}
            >
              Chapters
            </button>
            <button
              role="tab"
              aria-selected={tab == 'about'}
              onClick={() => setTab('about')}
            >
              About
            </button>
          </Tabs>
        )}
        {tab == 'chapters' && chapters.length > 0 ? (
          <Chapters>
            {chapters.map((chapter, index) => (
              <li key={chapter.start}>
                <Chapter
                  aria-current={index == current}
                  onClick={() => seek(chapter.start)}
                >
                  <span>{formatTimecode(chapter.start)}</span>
                  <span>{chapter.title}</span>
                  {index == current ? (
                    <Playing paused={!player.playing} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </Playing>
                  ) : (
                    <span />
                  )}
                </Chapter>
              </li>
            ))}
          </Chapters>
        ) : (
          <About css={{ marginTop: chapters.length ? 0 : '14px' }}>
            {about ? (
              <DescriptionText text={about} onSeek={seek} />
            ) : (
              <span style={{ color: 'inherit', opacity: 0.7 }}>
                No description.
              </span>
            )}
          </About>
        )}
      </Body>
    </>
  )
}
