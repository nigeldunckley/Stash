import {
  Check,
  Clock,
  LinkSimple,
  MagnifyingGlass,
  Plus,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useHandleAddUrl } from '../../../lib/hooks/useHandleAddUrl'
import {
  lookupYouTubeChannel,
  searchYouTubeChannels,
  YouTubeChannelMatch,
} from '../../../lib/networking/subscriptions/youtube'
import {
  useFollowChannel,
  useFollowedChannels,
} from '../../../lib/watch/channels'
import { useWatchCollections } from '../../../lib/watch/collections'
import { looksLikeYouTube, videoIdFromUrl } from '../../../lib/youtube'
import { CollectionSelect } from './Collections'
import { Kbd, SiteIcon } from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { keyframes, styled } from '../../tokens/stitches.config'

const appear = keyframes({
  from: { opacity: 0, transform: 'translateY(-4px)' },
  to: { opacity: 1, transform: 'none' },
})

const Root = styled('div', {
  position: 'relative',
  flex: '0 1 400px',
  minWidth: 0,
  marginLeft: 'auto',
  alignSelf: 'center',
  '@mdDown': { flex: '1 1 100%', marginLeft: 0 },
})

const Field = styled('label', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: '34px',
  padding: '0 10px',
  boxSizing: 'border-box',
  border: '1px solid $stLineStrong',
  borderRadius: '$sm',
  background: '$stSurface',
  color: '$stMuted',
  transition: `border-color ${motion.fast}, box-shadow ${motion.fast}`,
  '&:focus-within': {
    borderColor: '$stAccent',
    boxShadow: '0 0 0 3px $colors$stAccentTint',
    color: '$stInk',
  },
  '& input': {
    all: 'unset',
    flex: 1,
    minWidth: 0,
    fontFamily: '$inter',
    fontSize: '$small',
    color: '$stInk',
    '&::placeholder': { color: '$stMuted' },
  },
  // Larger text on a phone stops Safari zooming in.
  '@mdDown': { height: '38px', '& input': { fontSize: '16px' } },
})

const Panel = styled('div', {
  position: 'absolute',
  zIndex: 20,
  top: 'calc(100% + 6px)',
  right: 0,
  width: 'min(440px, calc(100vw - 32px))',
  padding: '6px',
  boxSizing: 'border-box',
  background: '$stSurface',
  border: '1px solid $stLineStrong',
  borderRadius: '$md',
  boxShadow: '0 18px 40px rgba(0, 0, 0, 0.16)',
  animation: `${appear} 140ms ease-out`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  '@mdDown': { left: 0, width: '100%' },
})

const Label = styled('div', {
  padding: '8px 8px 4px',
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: '$stMuted',
})

const Row = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '7px 8px',
  borderRadius: '$sm',
  fontFamily: '$inter',
  fontSize: '$small',
  color: '$stInk',
  '&[data-active="true"]': { background: '$stSunken' },
  '& > div': { minWidth: 0, flex: 1 },
  '& b': {
    display: 'block',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& small': {
    display: 'block',
    fontFamily: '$mono',
    fontSize: '$micro',
    letterSpacing: '0.02em',
    color: '$stMuted',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})

const Footer = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  margin: '4px 0 0',
  padding: '8px 8px 4px',
  borderTop: '1px solid $stLine',
  fontFamily: '$inter',
  fontSize: '$caption',
  color: '$stMuted',
})

const Hint = styled(Row, {
  color: '$stMuted',
  '& svg': { flex: 'none' },
})

const Action = styled('button', {
  all: 'unset',
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  height: '26px',
  padding: '0 10px',
  borderRadius: '$sm',
  fontFamily: '$inter',
  fontSize: '$caption',
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid $stLineStrong',
  color: '$stInk',
  background: '$stSurface',
  transition: `background ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  '&:disabled': { cursor: 'default', opacity: 0.6 },
  variants: {
    primary: {
      true: {
        background: '$stAccent',
        borderColor: '$stAccent',
        color: '$stOnAccent',
        '&:hover': { background: '$stAccent', filter: 'brightness(1.05)' },
      },
    },
    done: {
      true: {
        borderColor: 'transparent',
        background: '$stSunken',
        color: '$stMuted',
        cursor: 'default',
      },
    },
  },
})

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'video'; url: string; channel?: YouTubeChannelMatch }
  | { kind: 'channels'; channels: YouTubeChannelMatch[] }
  | { kind: 'none'; message: string }

const isLink = (value: string) =>
  /^https?:\/\//i.test(value) ||
  /^(www\.|m\.)?youtu(\.be|be\.com)\//i.test(value)

// One box for everything Watch takes in: paste a video link to watch it
// later, paste a channel link or @handle to follow it, or type a name to find
// the channel on YouTube. Press / to jump to it.
export function WatchAddBox(props: {
  // New channels go into this collection unless another is picked.
  collectionId?: string
}): JSX.Element {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState<string>()
  const [added, setAdded] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const request = useRef(0)
  const addUrl = useHandleAddUrl()
  const follow = useFollowChannel()
  const followed = useFollowedChannels()
  const [justFollowed, setJustFollowed] = useState<Set<string>>(new Set())
  const { collections, create: createCollection } = useWatchCollections()
  const [collectionId, setCollectionId] = useState<string | null>(
    props.collectionId ?? null
  )
  useEffect(
    () => setCollectionId(props.collectionId ?? null),
    [props.collectionId]
  )

  const isFollowing = (channel: YouTubeChannelMatch) =>
    justFollowed.has(channel.feedUrl) || followed.hasFeed(channel.feedUrl)

  // "/" anywhere on the page jumps here.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        event.key != '/' ||
        event.metaKey ||
        event.ctrlKey ||
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return
      }
      event.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Clicking elsewhere closes the panel.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  // Look up what was typed, a moment after typing stops.
  useEffect(() => {
    const text = value.trim()
    setActive(0)
    setAdded(false)
    if (text.length < 2) {
      setState({ kind: 'idle' })
      return
    }
    const id = ++request.current
    const timer = setTimeout(
      async () => {
        setState({ kind: 'loading' })
        try {
          if (isLink(text) && videoIdFromUrl(text)) {
            setState({ kind: 'video', url: text })
            const channel = await lookupYouTubeChannel(text)
            if (id == request.current) {
              setState({ kind: 'video', url: text, channel })
            }
            return
          }
          if (looksLikeYouTube(text)) {
            const channel = await lookupYouTubeChannel(text)
            if (id != request.current) return
            setState(
              channel
                ? { kind: 'channels', channels: [channel] }
                : {
                    kind: 'none',
                    message: 'No YouTube channel at that address.',
                  }
            )
            return
          }
          if (isLink(text)) {
            setState({
              kind: 'none',
              message: 'Paste a YouTube video or channel link.',
            })
            return
          }
          const channels = await searchYouTubeChannels(text)
          if (id != request.current) return
          setState(
            channels.length
              ? { kind: 'channels', channels }
              : { kind: 'none', message: `No channels called “${text}”.` }
          )
        } catch {
          if (id == request.current) {
            setState({
              kind: 'none',
              message: 'Could not reach YouTube. Try again in a moment.',
            })
          }
        }
      },
      isLink(text) ? 0 : 350
    )
    return () => clearTimeout(timer)
  }, [value])

  const followChannel = useCallback(
    async (channel: YouTubeChannelMatch) => {
      if (busy) return
      setBusy(channel.feedUrl)
      const result = await follow(channel, {
        collectionId: collectionId ?? undefined,
      })
      setBusy(undefined)
      if (result != 'failed') {
        setJustFollowed((current) => new Set(current).add(channel.feedUrl))
      }
    },
    [busy, follow, collectionId]
  )

  const addVideo = useCallback(
    async (url: string) => {
      if (added) return
      setAdded(true)
      await addUrl(
        url,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.language
      )
    },
    [added, addUrl]
  )

  // The rows that can be chosen with the arrow keys and Return.
  const choices: (() => void)[] =
    state.kind == 'video'
      ? [
          () => addVideo(state.url),
          ...(state.channel && !isFollowing(state.channel)
            ? [() => state.channel && followChannel(state.channel)]
            : []),
        ]
      : state.kind == 'channels'
      ? state.channels.map((channel) => () => {
          if (!isFollowing(channel)) followChannel(channel)
        })
      : []

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key == 'Escape') {
      if (value) setValue('')
      else input.current?.blur()
      setOpen(false)
    } else if (event.key == 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(choices.length - 1, index + 1))
    } else if (event.key == 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
    } else if (event.key == 'Enter') {
      event.preventDefault()
      choices[active]?.()
    }
  }

  const channelRow = (channel: YouTubeChannelMatch, index: number) => {
    const following = isFollowing(channel)
    return (
      <Row key={channel.feedUrl} data-active={index == active}>
        <SiteIcon src={channel.avatar} name={channel.title} size={30} round />
        <div>
          <b>{channel.title}</b>
          <small>
            {[channel.handle, channel.subscribers]
              .filter(Boolean)
              .join(' · ') || 'YouTube channel'}
          </small>
        </div>
        {following ? (
          <Action done disabled>
            <Check size={12} weight="bold" />
            Following
          </Action>
        ) : (
          <Action
            primary
            disabled={busy == channel.feedUrl}
            onClick={() => followChannel(channel)}
          >
            <Plus size={12} weight="bold" />
            Subscribe
          </Action>
        )}
      </Row>
    )
  }

  return (
    <Root ref={root}>
      <Field>
        {state.kind == 'loading' ? (
          <MagnifyingGlass size={15} />
        ) : isLink(value.trim()) ? (
          <LinkSimple size={15} />
        ) : (
          <Plus size={15} />
        )}
        <input
          ref={input}
          id="watch-add"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Paste a video or channel link, or search YouTube"
          aria-label="Add a video or find a channel"
          autoComplete="off"
          spellCheck={false}
        />
        <Kbd css={{ '@mdDown': { display: 'none' } }}>/</Kbd>
      </Field>
      {open && (
        <Panel role="listbox" aria-label="Results">
          {state.kind == 'idle' && (
            <>
              <Hint>
                <Clock size={15} />
                Paste a video link to add it to Watch later
              </Hint>
              <Hint>
                <LinkSimple size={15} />
                Paste a channel link or @handle to follow it
              </Hint>
              <Hint>
                <MagnifyingGlass size={15} />
                Type a channel’s name to find it on YouTube
              </Hint>
            </>
          )}
          {state.kind == 'loading' && <Hint>Looking on YouTube…</Hint>}
          {state.kind == 'none' && <Hint>{state.message}</Hint>}
          {state.kind == 'video' && (
            <>
              <Row data-active={active == 0}>
                <Clock size={18} />
                <div>
                  <b>{added ? 'Added to Watch later' : 'Add to Watch later'}</b>
                  <small>{state.url.replace(/^https?:\/\/(www\.)?/, '')}</small>
                </div>
                <Action
                  primary={!added}
                  done={added}
                  disabled={added}
                  onClick={() => addVideo(state.url)}
                >
                  {added ? <Check size={12} weight="bold" /> : null}
                  {added ? 'Added' : 'Add'}
                </Action>
              </Row>
              {state.channel && (
                <>
                  <Label>From the channel</Label>
                  {channelRow(state.channel, 1)}
                </>
              )}
            </>
          )}
          {state.kind == 'channels' && (
            <>
              <Label>Channels on YouTube</Label>
              {state.channels.map(channelRow)}
            </>
          )}
          {(state.kind == 'channels' ||
            (state.kind == 'video' && state.channel)) && (
            <Footer>
              Subscribe into
              <CollectionSelect
                label="Collection for new channels"
                collections={collections}
                value={collectionId}
                onCreate={(name) => createCollection(name)}
                onChange={setCollectionId}
              />
            </Footer>
          )}
        </Panel>
      )}
    </Root>
  )
}
