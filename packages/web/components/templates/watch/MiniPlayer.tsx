import { Pause, Play, SkipForward, X } from '@phosphor-icons/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { MINI, useWatchPlayer } from '../../../lib/watch/player'
import { floatingShadow, glassStrong, hairlineEdge } from '../../elements/stash'
import { globalCss, styled } from '../../tokens/stitches.config'

// On a Mac, a card in the bottom corner: the video on top (placed by the
// player) and these controls under it. On iPhone, a slim bar under the top
// bar, away from Safari's toolbar, with the video at its left end.
const Card = styled('div', {
  position: 'fixed',
  zIndex: 59,
  right: MINI.margin,
  bottom: MINI.margin,
  width: MINI.width,
  height: MINI.height + MINI.bar,
  boxSizing: 'border-box',
  borderRadius: '12px',
  boxShadow: floatingShadow,
  ...glassStrong,
  ...hairlineEdge,
  '@mdDown': {
    right: 0,
    left: 0,
    bottom: 'auto',
    top: 'calc(var(--topbar, 48px) + env(safe-area-inset-top, 0px))',
    width: '100%',
    height: MINI.phoneBar,
    borderRadius: 0,
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
  },
})

const Bar = styled('div', {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: MINI.bar,
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '0 6px 0 12px',
  '@mdDown': {
    top: 0,
    left: MINI.phoneVideo,
    height: MINI.phoneBar,
    padding: '0 4px 0 10px',
  },
})

const Title = styled('button', {
  all: 'unset',
  flex: 1,
  minWidth: 0,
  cursor: 'pointer',
  fontFamily: '$inter',
  fontSize: '$small',
  fontWeight: 500,
  lineHeight: 1.25,
  color: '$stInk',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '& small': {
    display: 'block',
    fontFamily: '$mono',
    fontSize: '$micro',
    fontWeight: 400,
    color: '$stMuted',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
})

const Control = styled('button', {
  all: 'unset',
  flex: 'none',
  display: 'grid',
  placeItems: 'center',
  width: '34px',
  height: '34px',
  borderRadius: '50%',
  color: '$stInk',
  cursor: 'pointer',
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-2px' },
  '&:disabled': { opacity: 0.35, cursor: 'default' },
  '@mdDown': { width: '40px', height: '40px' },
})

const Progress = styled('div', {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  height: '2px',
  background: '$stLine',
  '& i': { display: 'block', height: '100%', background: '$stAccent' },
  '@mdDown': { top: 'auto', bottom: 0 },
})

// On iPhone the bar takes room under the top bar instead of covering the
// top of the page.
const roomForBar = globalCss({
  '@media (max-width: 768px)': {
    'body[data-topbar="on"].watch-mini': {
      paddingTop: `calc(var(--topbar, 48px) + ${MINI.phoneBar}px + env(safe-area-inset-top, 0px))`,
    },
  },
})

export function MiniPlayer(): JSX.Element | null {
  const player = useWatchPlayer()
  const router = useRouter()
  const { item, state } = player
  const showing = !!item && !player.docked
  roomForBar()
  useEffect(() => {
    document.body.classList.toggle('watch-mini', showing)
    return () => document.body.classList.remove('watch-mini')
  }, [showing])
  if (!item || player.docked) return null
  const upcoming = player.queue.some((q) => q.id != item.id)
  const share = state.duration ? state.time / state.duration : 0
  return (
    <Card role="region" aria-label="Now playing">
      <Bar>
        <Progress aria-hidden="true">
          <i style={{ width: `${Math.round(share * 1000) / 10}%` }} />
        </Progress>
        <Title
          title="Open the player"
          onClick={() =>
            router.push({ pathname: '/l/watch', query: { v: item.id } })
          }
        >
          {item.title}
          <small>{item.author}</small>
        </Title>
        <Control
          aria-label={state.playing ? 'Pause' : 'Play'}
          onClick={player.toggle}
        >
          {state.playing ? (
            <Pause size={18} weight="fill" />
          ) : (
            <Play size={18} weight="fill" />
          )}
        </Control>
        <Control
          aria-label="Next video"
          disabled={!upcoming}
          onClick={player.next}
        >
          <SkipForward size={17} weight="fill" />
        </Control>
        <Control aria-label="Close player" onClick={player.close}>
          <X size={16} />
        </Control>
      </Bar>
    </Card>
  )
}
