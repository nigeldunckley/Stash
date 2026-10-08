import * as Dialog from '@radix-ui/react-dialog'
import {
  Archive,
  ArrowRight,
  ArrowSquareOut,
  Backspace,
  Bookmark,
  BookOpen,
  CaretDown,
  CaretUp,
  X,
} from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import {
  LibraryItemNode,
  useGetLibraryItemContent,
} from '../../../lib/networking/library_items/useLibraryItems'
import { formatMinutes, readingMinutes } from '../../../lib/readingTime'
import { shortTimeAgo } from '../../../lib/textFormatting'
import { keyframes, styled } from '../../tokens/stitches.config'
import {
  CoverImage,
  IconButton,
  Kbd,
  reducedMotion,
  SiteIcon,
} from '../../elements/stash'
import { ease, motion } from '../../elements/stash/motion'

export type FeedPeekProps = {
  item: LibraryItemNode
  username?: string
  sourceName: string
  sourceIcon?: string
  sourceIconFallback?: string
  position: number
  count: number
  saved: boolean
  onSave: () => void
  onArchive: () => void
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
  onOpenOriginal: () => void
  onRead: () => void
  // The pane's width after the reader drags its edge, or undefined to go
  // back to the default.
  onResize?: (width: number | undefined) => void
}

const slideIn = keyframes({
  from: { opacity: 0, transform: 'translateX(12px)' },
  to: { opacity: 1, transform: 'translateX(0)' },
})

const slideUp = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
})

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

const shimmer = keyframes({
  from: { opacity: 0.55 },
  to: { opacity: 1 },
})

// On wide screens the pane is a third column beside the list. Narrower
// windows float it over the right of the list instead.
export const PEEK_INLINE = '(min-width: 1240px)'

const Pane = styled('aside', {
  position: 'sticky',
  top: '24px',
  height: 'calc(100vh - 48px)',
  minWidth: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  overflow: 'hidden',
  boxSizing: 'border-box',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$lg',
  color: '$stInk',
  fontFamily: '$inter',
  animation: `${slideIn} 240ms ${ease}`,
  [reducedMotion]: { animation: 'none' },
  [`@media not all and ${PEEK_INLINE}`]: {
    position: 'fixed',
    zIndex: 30,
    top: '12px',
    right: '12px',
    bottom: '12px',
    height: 'auto',
    width: 'min(var(--peek-width, 520px), calc(100vw - 24px))',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04), 0 18px 48px rgba(0, 0, 0, 0.16)',
  },
})

// The pane's default width and how narrow it may get (px).
export const PEEK_WIDTH = 460
export const PEEK_MIN = 340
// The narrowest the list may get beside an inline pane (px).
export const LIST_MIN = 380

// The pane's left edge, dragged to trade list width for article width.
const Grip = styled('div', {
  position: 'absolute',
  zIndex: 4,
  top: 0,
  bottom: 0,
  left: 0,
  width: '9px',
  cursor: 'col-resize',
  touchAction: 'none',
  outline: 'none',
  '&::after': {
    content: '""',
    position: 'absolute',
    top: '50%',
    left: '3px',
    width: '3px',
    height: '36px',
    marginTop: '-18px',
    borderRadius: '3px',
    background: '$stLineStrong',
    opacity: 0,
    transition: `opacity ${motion.fast}, background ${motion.fast}, height ${motion.fast}`,
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '1px',
    background: '$stAccent',
    opacity: 0,
    transition: `opacity ${motion.fast}`,
  },
  '&:hover::after, &:focus-visible::after': { opacity: 1 },
  '&:focus-visible::after, &[data-dragging="true"]::after': {
    background: '$stAccent',
  },
  '&:hover::before, &:focus-visible::before, &[data-dragging="true"]::before': {
    opacity: 1,
  },
  '&[data-dragging="true"]::after': {
    opacity: 1,
    height: '56px',
    marginTop: '-28px',
  },
})

function ResizeGrip(props: {
  onResize?: (width: number | undefined) => void
}): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ right: number; max: number; width: number }>()

  // The widest the pane may get: inline, it leaves the list LIST_MIN;
  // floating, it leaves a strip of the list showing.
  const limits = (grip: HTMLElement) => {
    const pane = grip.parentElement as HTMLElement
    const panes = pane.parentElement as HTMLElement
    const right = pane.getBoundingClientRect().right
    const inline = window.matchMedia(PEEK_INLINE).matches
    const left = inline
      ? panes.getBoundingClientRect().left + 36 + 40 + LIST_MIN
      : 160
    return { right, max: Math.max(PEEK_MIN, right - left), pane, panes }
  }

  const apply = (grip: HTMLElement, width: number) => {
    const { max, panes } = limits(grip)
    const next = Math.round(Math.min(max, Math.max(PEEK_MIN, width)))
    panes.style.setProperty('--peek-width', `${next}px`)
    return next
  }

  const end = () => {
    if (!drag.current) return
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    setDragging(false)
    props.onResize?.(drag.current.width)
    drag.current = undefined
  }

  return (
    <Grip
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the preview"
      title="Drag to resize. Double-click to reset."
      tabIndex={0}
      data-dragging={dragging}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        const grip = event.currentTarget
        const { right, max, pane } = limits(grip)
        drag.current = { right, max, width: pane.offsetWidth }
        grip.setPointerCapture(event.pointerId)
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'col-resize'
        setDragging(true)
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        drag.current.width = apply(
          event.currentTarget,
          drag.current.right - event.clientX
        )
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => props.onResize?.(undefined)}
      onKeyDown={(event) => {
        const delta =
          event.key == 'ArrowLeft' ? 32 : event.key == 'ArrowRight' ? -32 : 0
        if (!delta) return
        event.preventDefault()
        const grip = event.currentTarget
        const pane = grip.parentElement as HTMLElement
        props.onResize?.(apply(grip, pane.offsetWidth + delta))
      }}
    />
  )
}

const Head = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: '46px',
  padding: '0 10px 0 14px',
  borderBottom: '1px solid $stLine',
  fontSize: '$caption',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  minWidth: 0,
})

const SourceName = styled('span', {
  color: '$stInk2',
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const Position = styled('span', {
  marginLeft: 'auto',
  fontFamily: '$mono',
  fontSize: '$micro',
  fontVariantNumeric: 'tabular-nums',
  paddingRight: '4px',
})

const Scroll = styled('div', {
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  WebkitOverflowScrolling: 'touch',
  paddingBottom: '120px',
})

const Hero = styled(CoverImage, {
  height: '200px',
  margin: '14px 14px 0',
  borderRadius: '10px',
  '@mdDown': { height: '160px', margin: '12px 12px 0' },
})

const Body = styled('article', {
  padding: '20px 28px 0',
  '@mdDown': { padding: '16px 18px 0' },
})

const Title = styled('h2', {
  margin: '0 0 10px',
  fontFamily: '$inter',
  fontSize: '23px',
  fontWeight: 600,
  lineHeight: 1.2,
  letterSpacing: '-0.022em',
  color: '$stInk',
  textWrap: 'balance',
  '@mdDown': { fontSize: '21px' },
})

const Meta = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 12px',
  paddingBottom: '16px',
  marginBottom: '18px',
  borderBottom: '1px solid $stLine',
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  color: '$stMuted',
})

// Article text in the Reader's serif. The content is the same cleaned-up
// HTML the Reader shows.
const Prose = styled('div', {
  fontFamily: '$serif',
  fontSize: '17px',
  lineHeight: 1.62,
  color: '$stInk2',
  overflowWrap: 'break-word',
  '@mdDown': { fontSize: '16.5px' },
  '& p': { margin: '0 0 14px' },
  '& h1, & h2, & h3, & h4, & h5, & h6': {
    fontFamily: '$inter',
    fontSize: '17px',
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: '-0.01em',
    color: '$stInk',
    margin: '26px 0 10px',
  },
  '& a': {
    color: '$stInk',
    textDecoration: 'underline',
    textDecorationColor: '$stLineStrong',
    textUnderlineOffset: '2px',
  },
  '& img, & video, & iframe': {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '6px',
    margin: '18px auto',
  },
  '& figure': { margin: '18px 0' },
  '& figcaption': {
    fontFamily: '$inter',
    fontSize: '$caption',
    color: '$stMuted',
    marginTop: '-10px',
  },
  '& blockquote': {
    margin: '18px 0',
    padding: '0 0 0 16px',
    borderLeft: '2px solid $stLine',
    color: '$stMuted',
  },
  '& pre': {
    overflowX: 'auto',
    padding: '12px 14px',
    background: '$stSunken',
    border: '1px solid $stLine',
    borderRadius: '6px',
    fontSize: '13px',
  },
  '& code': { fontFamily: '$mono', fontSize: '0.86em' },
  '& ul, & ol': { paddingLeft: '22px', margin: '0 0 14px' },
  '& hr': { border: 0, borderTop: '1px solid $stLine', margin: '24px 0' },
  '& table': { display: 'block', overflowX: 'auto', maxWidth: '100%' },
})

const Skeleton = styled('div', {
  display: 'grid',
  gap: '10px',
  marginTop: '18px',
  '& span': {
    height: '12px',
    borderRadius: '4px',
    background: '$stSunken',
    animation: `${shimmer} 900ms ${ease} infinite alternate`,
    [reducedMotion]: { animation: 'none' },
  },
})

const Fade = styled('div', {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: '110px',
  pointerEvents: 'none',
  background: 'linear-gradient(to bottom, transparent, $stSurface 55%)',
})

// One primary verb, one flow verb, then the two ways out.
const Dock = styled('div', {
  position: 'absolute',
  left: '50%',
  bottom: '16px',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '5px',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '12px',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04), 0 12px 32px rgba(0, 0, 0, 0.12)',
  whiteSpace: 'nowrap',
  zIndex: 2,
})

const Button = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '7px',
  height: '32px',
  padding: '0 10px 0 9px',
  borderRadius: '8px',
  fontFamily: '$inter',
  fontSize: '$small',
  fontWeight: 500,
  color: '$stInk',
  cursor: 'pointer',
  transition: `background ${motion.fast}, color ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  [`& ${Kbd}`]: {
    height: '17px',
    minWidth: '17px',
    background: 'transparent',
    color: 'inherit',
    opacity: 0.6,
    borderColor: 'currentColor',
  },
  variants: {
    primary: {
      true: {
        background: '$stInk',
        color: '$stCanvas',
        '&:hover': { background: '$stInk2' },
      },
    },
    saved: {
      true: {
        background: '$stAccent',
        color: '$stOnAccent',
        cursor: 'default',
        '&:hover': { background: '$stAccent' },
      },
    },
    // Larger targets for the phone sheet.
    touch: {
      true: {
        height: '46px',
        borderRadius: '12px',
        fontSize: '$ui',
        background: '$stSurface',
        border: '1px solid $stLine',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.10)',
      },
    },
    square: {
      true: { width: '46px', padding: 0 },
    },
  },
  compoundVariants: [
    {
      touch: true,
      primary: true,
      css: { background: '$stInk', borderColor: 'transparent' },
    },
    {
      touch: true,
      saved: true,
      css: { background: '$stAccent', borderColor: 'transparent' },
    },
  ],
})

const Divider = styled('span', {
  width: '1px',
  height: '18px',
  margin: '0 2px',
  background: '$stLine',
})

function SaveLabel(props: { saved: boolean; touch?: boolean }): JSX.Element {
  return props.saved ? (
    <>
      <Bookmark size={15} weight="fill" />
      Saved
    </>
  ) : (
    <>
      <Bookmark size={15} />
      {props.touch ? (
        'Save to Library'
      ) : (
        <>
          Save <Kbd>S</Kbd>
        </>
      )}
    </>
  )
}

// The article itself: picture, title, byline and text. While the text loads
// the excerpt stands in, so there is always something to read.
function PeekArticle(props: FeedPeekProps): JSX.Element {
  const { item } = props
  const { data, isPending, isError } = useGetLibraryItemContent(
    props.username,
    item.slug
  )
  const content = data?.content
  // Most articles open with the same picture the feed uses; show it once.
  const showHero =
    !!item.image && !(content && content.includes(item.image.split('?')[0]))
  const minutes = readingMinutes(item.wordsCount)
  return (
    <>
      {showHero && <Hero src={item.image} />}
      <Body>
        <Title>{item.title}</Title>
        <Meta>
          {item.author && <span>{item.author}</span>}
          {minutes && <span>{formatMinutes(minutes)} read</span>}
        </Meta>
        {content ? (
          <Prose dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          <Prose>
            {item.description && <p>{item.description}</p>}
            {isPending && (
              <Skeleton aria-label="Loading article">
                <span />
                <span style={{ width: '92%' }} />
                <span style={{ width: '96%' }} />
                <span style={{ width: '64%' }} />
              </Skeleton>
            )}
            {isError && (
              <p style={{ fontSize: 14, fontStyle: 'italic' }}>
                The full article could not be loaded here. Open the original to
                read it.
              </p>
            )}
          </Prose>
        )}
      </Body>
    </>
  )
}

function Source(props: FeedPeekProps): JSX.Element {
  return (
    <>
      <SiteIcon
        src={props.sourceIcon}
        fallbackSrc={props.sourceIconFallback}
        name={props.sourceName}
        size={16}
      />
      <SourceName>{props.sourceName}</SourceName>
      <span>
        · {shortTimeAgo(props.item.publishedAt || props.item.savedAt)}
      </span>
    </>
  )
}

// The desktop peek: a pane beside the list with the article and a dock of
// actions. The list stays where it was.
export function FeedPeekPane(props: FeedPeekProps): JSX.Element {
  return (
    <Pane aria-label="Peek">
      <ResizeGrip onResize={props.onResize} />
      <Head>
        <Source {...props} />
        <Position>
          {props.position} of {props.count}
        </Position>
        <IconButton
          label="Previous"
          shortcut="k"
          size="sm"
          disabled={props.position <= 1}
          onClick={props.onPrevious}
        >
          <CaretUp size={15} />
        </IconButton>
        <IconButton
          label="Next"
          shortcut="j"
          size="sm"
          disabled={props.position >= props.count}
          onClick={props.onNext}
        >
          <CaretDown size={15} />
        </IconButton>
        <IconButton
          label="Close"
          shortcut="Esc"
          size="sm"
          onClick={props.onClose}
        >
          <X size={15} />
        </IconButton>
      </Head>
      <Scroll key={props.item.id}>
        <PeekArticle {...props} />
      </Scroll>
      <Fade />
      <Dock>
        <Button
          primary={!props.saved}
          saved={props.saved}
          onClick={props.saved ? undefined : props.onSave}
          aria-label={props.saved ? 'Saved to Library' : 'Save to Library'}
        >
          <SaveLabel saved={props.saved} />
        </Button>
        <Button onClick={props.onArchive} aria-label="Archive">
          <Archive size={15} />
          Archive{' '}
          <Kbd>
            <Backspace size={11} />
          </Kbd>
        </Button>
        <Button onClick={props.onNext} aria-label="Next">
          Next <Kbd>J</Kbd>
        </Button>
        <Divider />
        <IconButton
          label="Open original"
          shortcut="v"
          size="sm"
          onClick={props.onOpenOriginal}
        >
          <ArrowSquareOut size={15} />
        </IconButton>
        <IconButton
          label="Read in Stash"
          shortcut="o"
          size="sm"
          onClick={props.onRead}
        >
          <BookOpen size={15} />
        </IconButton>
      </Dock>
    </Pane>
  )
}

const Overlay = styled(Dialog.Overlay, {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: '$overlay',
  animation: `${fadeIn} 200ms ease`,
  [reducedMotion]: { animation: 'none' },
})

const Sheet = styled(Dialog.Content, {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 201,
  height: 'calc(100dvh - 44px - env(safe-area-inset-top, 0px))',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  overflow: 'hidden',
  boxSizing: 'border-box',
  background: '$stSurface',
  color: '$stInk',
  borderTop: '1px solid $stLine',
  borderRadius: '18px 18px 0 0',
  fontFamily: '$inter',
  animation: `${slideUp} 320ms ${ease}`,
  '&:focus': { outline: 'none' },
  [reducedMotion]: { animation: 'none' },
})

const Grab = styled('div', {
  touchAction: 'none',
  cursor: 'grab',
  '& > i': {
    display: 'block',
    width: '36px',
    height: '4px',
    borderRadius: '4px',
    background: '$stLineStrong',
    margin: '8px auto',
  },
})

const SheetDock = styled('div', {
  position: 'absolute',
  left: '12px',
  right: '12px',
  bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto auto auto',
  gap: '8px',
  zIndex: 2,
})

// How far the sheet must be pulled down to close.
const DISMISS = 100

// The phone peek: a tall sheet over the list. Pull the handle down or tap
// outside to close it.
export function FeedPeekSheet(
  props: FeedPeekProps & { open: boolean }
): JSX.Element {
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<number>()

  const grab = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest('button')) {
        return
      }
      start.current = event.clientY
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (start.current !== undefined) {
        setPull(Math.max(0, event.clientY - start.current))
      }
    },
    onPointerUp: () => {
      start.current = undefined
      setDragging(false)
      if (pull > DISMISS) {
        props.onClose()
      }
      setPull(0)
    },
    onPointerCancel: () => {
      start.current = undefined
      setDragging(false)
      setPull(0)
    },
  }

  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => !open && props.onClose()}
    >
      <Dialog.Portal>
        <Overlay />
        <Sheet
          aria-describedby={undefined}
          style={{
            transform: pull ? `translateY(${pull}px)` : undefined,
            transition: dragging ? 'none' : `transform 200ms ${ease}`,
          }}
        >
          <Grab {...grab}>
            <i />
            <Head
              css={{
                height: '36px',
                borderBottom: 'none',
                paddingBottom: '8px',
              }}
            >
              <Dialog.Title asChild>
                <span style={{ display: 'contents' }}>
                  <Source {...props} />
                </span>
              </Dialog.Title>
              <Position>
                {props.position} / {props.count}
              </Position>
              <IconButton label="Close" onClick={props.onClose}>
                <X size={17} />
              </IconButton>
            </Head>
          </Grab>
          <Scroll key={props.item.id} css={{ borderTop: '1px solid $stLine' }}>
            <PeekArticle {...props} />
          </Scroll>
          <Fade />
          <SheetDock>
            <Button
              touch
              primary={!props.saved}
              saved={props.saved}
              onClick={props.saved ? undefined : props.onSave}
            >
              <SaveLabel saved={props.saved} touch />
            </Button>
            <Button touch square aria-label="Archive" onClick={props.onArchive}>
              <Archive size={18} />
            </Button>
            <Button
              touch
              square
              aria-label="Open original"
              onClick={props.onOpenOriginal}
            >
              <ArrowSquareOut size={18} />
            </Button>
            <Button touch square aria-label="Next" onClick={props.onNext}>
              <ArrowRight size={18} />
            </Button>
          </SheetDock>
        </Sheet>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
