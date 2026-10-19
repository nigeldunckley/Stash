import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { keyframes, styled } from '../../tokens/stitches.config'
import type { LibraryItemNode } from '../../../lib/networking/library_items/useLibraryItems'
import { CoverImage } from '../../elements/stash/CoverImage'
import { TypeCover, typeCoverFor } from '../../elements/stash/TypeCover'
import { reducedMotion } from '../../elements/stash/motion'
import { LIBRARY_LEFT_MENU_WIDTH } from '../navMenu/NavigationMenu'
import { formatMinutes, readingMinutes } from '../../../lib/readingTime'
import { shortTimeAgo } from '../../../lib/textFormatting'

// The Sort: this morning's feeds as a stack of front pages, one at a time.
// Save sends the page up into Saved, Skip slides it on (it counts as seen),
// Archive folds it away, Read opens it. On a phone you flick: up to save,
// left to archive, right to skip. The last card is a small colophon of what
// you sorted.

type Verdict = 'saved' | 'skipped' | 'archived'

type TheSortProps = {
  items: LibraryItemNode[]
  sourceName: (item: LibraryItemNode) => string
  onSave: (item: LibraryItemNode) => void
  onArchive: (item: LibraryItemNode) => void
  onSkip: (item: LibraryItemNode) => void
  onRead: (item: LibraryItemNode) => void
  // Asks for more items when the stack runs low.
  onNeedMore?: () => void
  onClose: () => void
}

const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(24px) scale(0.98)' },
  to: { opacity: 1, transform: 'none' },
})

const Backdrop = styled('div', {
  position: 'fixed',
  inset: 0,
  zIndex: 900,
  display: 'grid',
  gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
  background: '$stSurface',
  // The sidebar stays in view so a save can land in Saved.
  '@md': { left: LIBRARY_LEFT_MENU_WIDTH },
  animation: `${rise} 260ms cubic-bezier(0.2, 0, 0, 1) both`,
  [reducedMotion]: { animation: 'none' },
})

const Bar = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: 'calc(18px + env(safe-area-inset-top, 0px)) 28px 12px',
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '$stMuted',
  '& b': { fontWeight: 500, color: '$stInk' },
  '@smDown': {
    padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 10px',
  },
})

const Close = styled('button', {
  all: 'unset',
  marginLeft: 'auto',
  cursor: 'pointer',
  padding: '6px 2px',
  '&:hover': { color: '$stInk' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

const Progress = styled('div', {
  height: '2px',
  margin: '0 28px',
  background: '$stLine',
  '& > span': {
    display: 'block',
    height: '100%',
    background: '$stInk',
    transition: 'width 300ms cubic-bezier(0.2, 0, 0, 1)',
  },
  '@smDown': { margin: '0 16px' },
})

const Stage = styled('div', {
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  padding: '24px',
  minHeight: 0,
  touchAction: 'none',
  '@smDown': { padding: '16px' },
})

const Card = styled('article', {
  position: 'absolute',
  width: 'min(460px, calc(100% - 32px))',
  height: 'min(480px, calc(100% - 32px))',
  display: 'grid',
  gridTemplateRows: '45% minmax(0, 1fr)',
  overflow: 'hidden',
  background: '$stSurface',
  border: '1px solid $stLineStrong',
  borderRadius: '10px',
  boxShadow: '0 18px 40px rgba(9, 9, 11, 0.1)',
  willChange: 'transform',
  cursor: 'grab',
  userSelect: 'none',
  '&[data-behind]': {
    borderColor: '$stLine',
    boxShadow: 'none',
    cursor: 'default',
    pointerEvents: 'none',
  },
  '@smDown': { height: 'min(560px, calc(100% - 24px))' },
})

const Picture = styled(CoverImage, {
  width: '100%',
  height: '100%',
  borderRadius: 0,
})

const Copy = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '20px 24px',
  minHeight: 0,
  overflow: 'hidden',
  '@smDown': { padding: '16px 18px' },
})

const Kicker = styled('div', {
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: '$stAccentText',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const Headline = styled('h2', {
  margin: 0,
  fontFamily: '$serif',
  fontWeight: 500,
  fontSize: '31px',
  lineHeight: 1.05,
  letterSpacing: '-0.02em',
  color: '$stInk',
  textWrap: 'balance',
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  '@smDown': { fontSize: '27px' },
})

const Deck = styled('p', {
  margin: 0,
  fontFamily: '$serif',
  fontSize: '15px',
  lineHeight: 1.45,
  color: '$stInk2',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const Stamp = styled('span', {
  position: 'absolute',
  top: '14px',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '4px 8px',
  borderRadius: '3px',
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#FFFFFF',
  background: '$stAccent',
  pointerEvents: 'none',
  '&[data-kind="archive"]': { background: '$stInk', color: '$stSurface' },
  '&[data-kind="skip"]': {
    background: '$stSurface',
    color: '$stInk',
    border: '1px solid $stLineStrong',
  },
})

const Buttons = styled('div', {
  display: 'flex',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: '10px',
  padding: '12px 16px calc(22px + env(safe-area-inset-bottom, 0px))',
})

const Button = styled('button', {
  all: 'unset',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  height: '38px',
  padding: '0 14px',
  borderRadius: '6px',
  border: '1px solid $stLineStrong',
  background: '$stSurface',
  fontFamily: '$inter',
  fontSize: '13px',
  color: '$stInk',
  cursor: 'pointer',
  '& kbd': { fontFamily: '$mono', fontSize: '11px', color: '$stMuted' },
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '&[data-primary]': {
    background: '$stInk',
    borderColor: '$stInk',
    color: '$stSurface',
    '& kbd': { color: '$stLineStrong' },
  },
  '@smDown': { '& kbd': { display: 'none' } },
})

const Colophon = styled('div', {
  display: 'grid',
  gap: '18px',
  justifyItems: 'center',
  textAlign: 'center',
  maxWidth: '380px',
  animation: `${rise} 320ms cubic-bezier(0.2, 0, 0, 1) both`,
  '& h2': {
    margin: 0,
    fontFamily: '$serif',
    fontWeight: 500,
    fontSize: '34px',
    letterSpacing: '-0.02em',
    color: '$stInk',
  },
  '& p': {
    margin: 0,
    fontFamily: '$serif',
    fontStyle: 'italic',
    fontSize: '17px',
    lineHeight: 1.45,
    color: '$stInk2',
  },
  '& dl': {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, auto)',
    gap: '4px 28px',
    margin: 0,
    paddingTop: '14px',
    borderTop: '1px solid $stInk',
    fontFamily: '$mono',
    textTransform: 'uppercase',
  },
  '& dt': { fontSize: '9.5px', letterSpacing: '0.09em', color: '$stMuted' },
  '& dd': { margin: 0, fontSize: '15px', color: '$stInk', gridRow: 2 },
})

const EXIT_MS = 300
const FLICK = 90

const exitFor = (verdict: Verdict): Keyframe[] =>
  verdict == 'saved'
    ? [
        { transform: 'translate(0, 0)', opacity: 1 },
        {
          transform: 'translate(0, -70vh) rotate(-3deg) scale(0.86)',
          opacity: 0,
        },
      ]
    : verdict == 'archived'
    ? [
        { transform: 'translate(0, 0)', opacity: 1, offset: 0 },
        {
          transform: 'translate(-20px, 0) scaleY(0.02)',
          opacity: 1,
          offset: 0.55,
        },
        { transform: 'translate(-60vw, 0) scaleY(0.02)', opacity: 0 },
      ]
    : [
        { transform: 'translate(0, 0) rotate(0)', opacity: 1 },
        { transform: 'translate(70vw, 0) rotate(8deg)', opacity: 0 },
      ]

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function TheSort(props: TheSortProps): JSX.Element {
  // The stack is fixed when the Sort opens; more are added at the end.
  const [queue, setQueue] = useState<LibraryItemNode[]>(() => props.items)
  const [index, setIndex] = useState(0)
  const [verdicts, setVerdicts] = useState<Verdict[]>([])
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const busy = useRef(false)
  const cardRef = useRef<HTMLElement | null>(null)
  const start = useRef<{ x: number; y: number } | undefined>()

  useEffect(() => {
    setQueue((current) => {
      const ids = new Set(current.map((item) => item.id))
      const extra = props.items.filter((item) => !ids.has(item.id))
      return extra.length ? [...current, ...extra] : current
    })
  }, [props.items])

  const item = queue[index] as LibraryItemNode | undefined
  useEffect(() => {
    if (queue.length - index < 4) props.onNeedMore?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue.length])

  const decide = useCallback(
    async (verdict: Verdict) => {
      if (!item || busy.current) return
      busy.current = true
      if (verdict == 'saved') props.onSave(item)
      else if (verdict == 'archived') props.onArchive(item)
      else props.onSkip(item)
      const card = cardRef.current
      if (card && !prefersReduced()) {
        const from = card.style.transform || 'translate(0, 0)'
        const frames = exitFor(verdict)
        frames[0] = { ...frames[0], transform: from }
        await card
          .animate(frames, {
            duration: EXIT_MS,
            easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
            fill: 'forwards',
          })
          .finished.catch(() => undefined)
      }
      setVerdicts((current) => [...current, verdict])
      setDrag({ x: 0, y: 0 })
      setIndex((current) => current + 1)
      busy.current = false
    },
    [item, props]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key
      if (key == 'Escape') props.onClose()
      else if (!item) return
      else if (key == 's' || key == 'S' || key == 'ArrowUp') decide('saved')
      else if (key == 'Backspace' || key == 'Delete' || key == 'ArrowLeft')
        decide('archived')
      else if (key == ' ' || key == 'ArrowRight') decide('skipped')
      else if (key == 'Enter') props.onRead(item)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [item, decide, props])

  // Nothing behind the Sort scrolls while it is open.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const counts = useMemo(
    () => ({
      saved: verdicts.filter((v) => v == 'saved').length,
      archived: verdicts.filter((v) => v == 'archived').length,
    }),
    [verdicts]
  )
  const savedMinutes = queue
    .slice(0, index)
    .filter((_, i) => verdicts[i] == 'saved')
    .reduce((sum, saved) => sum + (readingMinutes(saved.wordsCount) ?? 0), 0)

  const hint =
    drag.y < -FLICK / 2 && Math.abs(drag.y) > Math.abs(drag.x)
      ? 'save'
      : drag.x < -FLICK / 2
      ? 'archive'
      : drag.x > FLICK / 2
      ? 'skip'
      : undefined

  const now = Date.now()
  const total = queue.length

  return (
    <Backdrop role="dialog" aria-modal="true" aria-label="The Sort">
      <Bar>
        <b>The Sort</b>
        <span>·</span>
        <span aria-live="polite">
          {item ? `${index + 1} of ${total}` : `${total} sorted`}
        </span>
        <span>·</span>
        <span>{counts.saved} saved</span>
        <Close type="button" onClick={props.onClose}>
          Esc · Done
        </Close>
      </Bar>
      <Progress aria-hidden="true">
        <span style={{ width: `${total ? (index / total) * 100 : 100}%` }} />
      </Progress>

      <Stage>
        {item ? (
          <>
            {queue.slice(index + 1, index + 3).map((next, offset) => (
              <Card
                key={next.id}
                data-behind=""
                aria-hidden="true"
                style={{
                  transform: `translate(${(offset + 1) * 9}px, ${
                    (offset + 1) * 7
                  }px) rotate(${offset + 1}deg)`,
                  zIndex: 1 - offset,
                }}
              />
            ))}
            <Card
              key={item.id}
              ref={cardRef}
              data-moment-source=""
              style={{
                zIndex: 3,
                transform: `translate(${drag.x}px, ${drag.y}px) rotate(${
                  drag.x / 24
                }deg)`,
                transition: start.current
                  ? 'none'
                  : 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
              }}
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest('button')) return
                start.current = { x: event.clientX, y: event.clientY }
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                if (!start.current) return
                setDrag({
                  x: event.clientX - start.current.x,
                  y: event.clientY - start.current.y,
                })
              }}
              onPointerUp={() => {
                const moved = Math.hypot(drag.x, drag.y)
                start.current = undefined
                if (moved < 6) {
                  setDrag({ x: 0, y: 0 })
                  props.onRead(item)
                } else if (
                  drag.y < -FLICK &&
                  Math.abs(drag.y) > Math.abs(drag.x)
                ) {
                  decide('saved')
                } else if (drag.x < -FLICK) {
                  decide('archived')
                } else if (drag.x > FLICK) {
                  decide('skipped')
                } else {
                  setDrag({ x: 0, y: 0 })
                }
              }}
              onPointerCancel={() => {
                start.current = undefined
                setDrag({ x: 0, y: 0 })
              }}
            >
              <Picture
                src={item.headerImage ?? item.image}
                fallback={
                  <TypeCover {...typeCoverFor(item, props.sourceName(item))} />
                }
              />
              <Copy>
                <Kicker>
                  {[
                    props.sourceName(item),
                    shortTimeAgo(item.publishedAt || item.savedAt, now),
                    formatMinutes(readingMinutes(item.wordsCount)),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Kicker>
                <Headline className="row-title" data-morph-title={item.id}>
                  {item.title}
                </Headline>
                {item.description && <Deck>{item.description}</Deck>}
              </Copy>
              {hint && (
                <Stamp data-kind={hint}>
                  {hint == 'save'
                    ? 'Save'
                    : hint == 'archive'
                    ? 'Archive'
                    : 'Skip'}
                </Stamp>
              )}
            </Card>
          </>
        ) : (
          <Colophon>
            <h2>All sorted.</h2>
            <p>
              {counts.saved
                ? `${
                    savedMinutes ? formatMinutes(savedMinutes) : 'Some reading'
                  } set aside in Saved for later.`
                : 'Nothing kept this time, and nothing left waiting.'}
            </p>
            <dl>
              <dt>Sorted</dt>
              <dd>{total}</dd>
              <dt>Saved</dt>
              <dd>{counts.saved}</dd>
              <dt>Archived</dt>
              <dd>{counts.archived}</dd>
            </dl>
            <Button type="button" data-primary="" onClick={props.onClose}>
              Done
            </Button>
          </Colophon>
        )}
      </Stage>

      {item && (
        <Buttons>
          <Button type="button" onClick={() => decide('archived')}>
            <kbd>⌫</kbd>Archive
          </Button>
          <Button type="button" onClick={() => decide('skipped')}>
            <kbd>→</kbd>Skip
          </Button>
          <Button type="button" data-primary="" onClick={() => decide('saved')}>
            <kbd>S</kbd>Save
          </Button>
          <Button type="button" onClick={() => props.onRead(item)}>
            <kbd>↵</kbd>Read now
          </Button>
        </Buttons>
      )}
    </Backdrop>
  )
}
