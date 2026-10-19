import { MutableRefObject, useEffect, useRef, useState } from 'react'
import { keyframes, styled } from '../../tokens/stitches.config'
import { Ribbon } from '../../elements/stash/Ribbon'
import { reducedMotion, spring } from '../../elements/stash/motion'

// Coming back to a half-read article, a ribbon in the margin marks the
// paragraph you stopped at, as a bookmark ribbon would in a book. It stays
// until you've read on past it, then goes for the rest of the visit.
//
// Like the margin notes, it sits beside the text and never touches the
// article's own HTML.

// Room needed in the margin for the ribbon, and for its label too.
const RIBBON_ROOM = 24
const LABEL_ROOM = 150

const drop = keyframes({
  from: { opacity: 0, transform: 'translateY(-12px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
})

const Layer = styled('div', {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  pointerEvents: 'none',
  '@media print': { display: 'none' },
})

const Marker = styled('div', {
  position: 'absolute',
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  transition: 'opacity 400ms ease',
  animation: `${drop} 320ms ${spring} both`,
  '&[data-leaving]': { opacity: 0 },
  [reducedMotion]: { animation: 'none' },
})

const Label = styled('div', {
  marginTop: '40px',
  fontFamily: '$mono',
  fontSize: '10.5px',
  fontWeight: 500,
  lineHeight: 1.5,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  textAlign: 'right',
  whiteSpace: 'nowrap',
  color: '$stAccentText',
})

type PlaceMarkerProps = {
  contentRef: MutableRefObject<HTMLDivElement | null>
  anchorIndex: number
  progress?: number
  // False when the article opened on a highlight instead of your place.
  enabled: boolean
}

type Placement = { top: number; left: number; label: boolean; small: boolean }

export function PlaceMarker(props: PlaceMarkerProps): JSX.Element | null {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const [placement, setPlacement] = useState<Placement | undefined>()
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)
  // Where you were when the article opened; reading on doesn't move it.
  const [start] = useState(() => ({
    progress: Math.round(props.progress ?? 0),
    anchorIndex: props.anchorIndex,
  }))
  const progress = start.progress
  const wanted = props.enabled && progress >= 3 && progress <= 97

  useEffect(() => {
    if (!wanted || gone) return
    const root = props.contentRef.current
    if (!root) return
    let anchor: Element | null = null
    let seen = false

    const place = () => {
      const layer = layerRef.current
      const container = layer?.parentElement
      anchor = root.querySelector(
        `[data-omnivore-anchor-idx='${start.anchorIndex}']`
      )
      if (!layer || !container || !anchor) return
      // The anchor may be an inline element; mark the block it sits in.
      const block =
        anchor.closest('p, li, blockquote, h1, h2, h3, h4, figure, pre') ??
        anchor
      const containerRect = container.getBoundingClientRect()
      const wrapper = document.getElementById('article-wrapper')
      let edge = 0
      if (wrapper) {
        edge =
          wrapper.getBoundingClientRect().left +
          parseFloat(getComputedStyle(wrapper).paddingLeft)
      }
      const room = containerRect.left - edge
      if (room < RIBBON_ROOM) {
        setPlacement(undefined)
        return
      }
      const small = room < 64
      setPlacement({
        top: block.getBoundingClientRect().top - containerRect.top - 6,
        left: small ? -16 : -40,
        label: room >= LABEL_ROOM,
        small,
      })
    }

    // Let the reader restore your scroll position first.
    const timer = setTimeout(place, 250)
    window.addEventListener('resize', place)

    // Once you've read on past it, put it away.
    const onScroll = () => {
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const inView = rect.bottom > 0 && rect.top < window.innerHeight
      if (inView) {
        seen = true
        return
      }
      const away =
        rect.bottom < -window.innerHeight || rect.top > 2 * window.innerHeight
      if (seen && away) {
        setLeaving(true)
        setTimeout(() => setGone(true), 400)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll)
    }
  }, [wanted, gone, props.contentRef, start.anchorIndex])

  if (!wanted || gone) return null

  return (
    <Layer ref={layerRef} aria-hidden="true">
      {placement && (
        <Marker
          data-leaving={leaving ? '' : undefined}
          style={{
            top: `${placement.top}px`,
            right: `${-placement.left - (placement.small ? 8 : 12)}px`,
          }}
        >
          {placement.label && (
            <Label>
              You stopped here
              <br />
              {progress}% read
            </Label>
          )}
          {placement.small ? (
            <Ribbon width={8} height={22} />
          ) : (
            <Ribbon width={12} height={34} />
          )}
        </Marker>
      )}
    </Layer>
  )
}
