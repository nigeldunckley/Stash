import { Archive, ArrowSquareOut, Clock, Play } from '@phosphor-icons/react'
import { forwardRef, HTMLAttributes, ReactNode } from 'react'
import { LibraryItemNode } from '../../../lib/networking/library_items/useLibraryItems'
import { formatTimecode, isShortsUrl, videoSeconds } from '../../../lib/youtube'
import {
  CoverImage,
  IconButton,
  SiteIcon,
  UnseenDot,
} from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'

// Videos in a grid that fills as many columns as fit, one on a phone.
export const VideoGrid = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))',
  gap: '22px 18px',
  '@smDown': { gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' },
})

// The day groups, one under another.
export const VideoGroups = styled('div', {
  display: 'grid',
  gap: '30px',
  '@smDown': { gap: '28px' },
})

// Today, Yesterday, This week… above each run of videos.
export const VideoGroup = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  margin: '0 2px 12px',
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: '$stMuted',
  '&::after': {
    content: '""',
    flex: 1,
    height: '1px',
    background: '$stLine',
  },
})

const Thumb = styled('div', {
  position: 'relative',
  aspectRatio: '16 / 9',
  borderRadius: '10px',
  overflow: 'hidden',
  background: '$stSunken',
  transition: `box-shadow ${motion.fast}`,
  '& > span:first-child': { position: 'absolute', inset: 0 },
})

const Duration = styled('span', {
  position: 'absolute',
  right: '6px',
  bottom: '6px',
  padding: '1px 5px',
  borderRadius: '4px',
  background: 'rgba(9, 9, 11, 0.78)',
  color: '#FFFFFF',
  fontFamily: '$mono',
  fontSize: '10.5px',
  fontWeight: 500,
  lineHeight: '16px',
  fontVariantNumeric: 'tabular-nums',
  '@smDown': { fontSize: '11.5px' },
})

const Watched = styled('span', {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: '3px',
  background: 'rgba(255, 255, 255, 0.3)',
  '& > i': { display: 'block', height: '100%', background: '$stAccent' },
})

const PlayHint = styled('span', {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  opacity: 0,
  transition: `opacity ${motion.fast}`,
  '& > span': {
    display: 'grid',
    placeItems: 'center',
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: 'rgba(9, 9, 11, 0.6)',
    color: '#FFFFFF',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  },
})

const Actions = styled('div', {
  position: 'absolute',
  top: '6px',
  right: '6px',
  display: 'none',
  gap: '2px',
  padding: '2px',
  borderRadius: '8px',
  background: '$stSurface',
  border: '1px solid $stLine',
  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
  // Phones swipe instead.
  '@mdDown': { display: 'none !important' },
})

const Info = styled('div', {
  display: 'grid',
  gridTemplateColumns: '8px minmax(0, 1fr)',
  gap: '6px',
  padding: '0 2px',
  '& > span:first-child': { marginTop: '6px' },
})

const Title = styled('div', {
  fontFamily: '$inter',
  fontSize: '13.5px',
  fontWeight: 500,
  lineHeight: 1.32,
  letterSpacing: '-0.005em',
  color: '$stInk',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  '@smDown': { fontSize: '15px' },
})

const Meta = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginTop: '4px',
  fontFamily: '$inter',
  fontSize: '$caption',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  '& > *': { flex: 'none' },
  '& > b': {
    flex: '0 1 auto',
    minWidth: 0,
    fontWeight: 400,
    color: '$stInk2',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '@smDown': { fontSize: '13px' },
})

const Chip = styled('span', {
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  padding: '0 5px',
  lineHeight: '16px',
  borderRadius: '4px',
  border: '1px solid $stLine',
  color: '$stMuted',
  variants: {
    accent: {
      true: {
        color: '$stAccentText',
        background: '$stAccentTint',
        borderColor: 'transparent',
      },
    },
  },
})

const Root = styled('div', {
  position: 'relative',
  display: 'grid',
  gap: '9px',
  alignContent: 'start',
  cursor: 'pointer',
  outline: 'none',
  borderRadius: '12px',
  '@media (hover: hover)': {
    [`&:hover ${PlayHint}`]: { opacity: 1 },
    [`&:hover ${Actions}`]: { display: 'flex' },
  },
  [`&:focus-within ${Actions}`]: { display: 'flex' },
  [`&:focus-visible ${Thumb}`]: {
    boxShadow: '0 0 0 2px $colors$stCanvas, 0 0 0 4px $colors$stAccent',
  },
  variants: {
    selected: {
      true: {
        [`& ${Thumb}`]: {
          boxShadow: '0 0 0 2px $colors$stCanvas, 0 0 0 4px $colors$stAccent',
        },
        [`& ${Actions}`]: { display: 'flex' },
      },
    },
    muted: {
      true: {
        [`& ${Title}`]: { color: '$stMuted', fontWeight: 400 },
      },
    },
  },
})

type VideoCardOwnProps = {
  item: LibraryItemNode
  channelName: string
  channelIcon?: string
  // Hidden when the list is already one channel's.
  showChannel: boolean
  age: ReactNode
  seen: boolean
  saved: boolean
  // Already in Watch later, so there is nothing to save.
  queued?: boolean
  selected: boolean
  onOpen: () => void
  onFocus: () => void
  onSave: () => void
  onArchive: () => void
  onOpenOriginal: () => void
}

// Other attributes, such as a context menu's handlers, go on the card.
export type VideoCardProps = VideoCardOwnProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof VideoCardOwnProps>

// The share of a video already watched, from the position the Watch pane
// stores, if it is worth showing.
export const watchedFraction = (item: LibraryItemNode) => {
  const seconds = videoSeconds(item.wordsCount)
  const at = item.readingProgressAnchorIndex
  if (!seconds || !at || at < 10 || at > seconds - 15) return undefined
  return at / seconds
}

// One video: its thumbnail with length and progress, then title, channel
// and age. Hovering shows Save, Archive and Open on YouTube.
export const VideoCard = forwardRef<HTMLDivElement, VideoCardProps>(
  function VideoCard(props, ref) {
    const {
      item,
      channelName: _channelName,
      channelIcon: _channelIcon,
      showChannel: _showChannel,
      age: _age,
      seen: _seen,
      saved: _saved,
      queued: _queued,
      selected: _selected,
      onOpen: _onOpen,
      onFocus: _onFocus,
      onSave: _onSave,
      onArchive: _onArchive,
      onOpenOriginal: _onOpenOriginal,
      ...rest
    } = props
    const seconds = videoSeconds(item.wordsCount)
    const watched = watchedFraction(item)
    const short = isShortsUrl(item.originalArticleUrl)
    return (
      <Root
        {...rest}
        ref={ref}
        role="link"
        tabIndex={0}
        aria-label={item.title}
        selected={props.selected}
        muted={props.seen && !props.queued}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button, a')) return
          props.onOpen()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target === event.currentTarget) {
            props.onOpen()
          }
        }}
        onFocus={props.onFocus}
      >
        <Thumb>
          <CoverImage src={item.headerImage || item.image} />
          <PlayHint aria-hidden="true">
            <span>
              <Play size={18} weight="fill" />
            </span>
          </PlayHint>
          {seconds && <Duration>{formatTimecode(seconds)}</Duration>}
          {watched && (
            <Watched aria-hidden="true">
              <i style={{ width: `${Math.round(watched * 100)}%` }} />
            </Watched>
          )}
          <Actions>
            {!props.queued && (
              <IconButton
                label={props.saved ? 'In Watch later' : 'Watch later'}
                shortcut="s"
                size="sm"
                active={props.saved}
                onClick={props.onSave}
              >
                <Clock size={14} weight={props.saved ? 'fill' : 'regular'} />
              </IconButton>
            )}
            <IconButton
              label="Archive"
              shortcut="⌫"
              size="sm"
              onClick={props.onArchive}
            >
              <Archive size={14} />
            </IconButton>
            <IconButton
              label="Open on YouTube"
              shortcut="v"
              size="sm"
              onClick={props.onOpenOriginal}
            >
              <ArrowSquareOut size={14} />
            </IconButton>
          </Actions>
        </Thumb>
        <Info>
          <UnseenDot hidden={props.seen} />
          <div style={{ minWidth: 0 }}>
            <Title>{item.title}</Title>
            <Meta>
              {props.showChannel && (
                <>
                  <SiteIcon
                    src={props.channelIcon}
                    name={props.channelName}
                    size={16}
                    round
                  />
                  <b>{props.channelName}</b>
                  <span>·</span>
                </>
              )}
              <span>{props.age}</span>
              {short && <Chip>Short</Chip>}
              {watched && seconds && (
                <Chip accent>
                  Resume {formatTimecode(item.readingProgressAnchorIndex)}
                </Chip>
              )}
              {props.saved && !props.queued && (
                <>
                  <span>·</span>
                  <span>In Watch later</span>
                </>
              )}
            </Meta>
          </div>
        </Info>
      </Root>
    )
  }
)
