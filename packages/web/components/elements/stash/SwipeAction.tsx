import { ReactNode, useRef, useState } from 'react'
import { styled } from '../../tokens/stitches.config'
import { ease } from './motion'

const Root = styled('div', {
  position: 'relative',
  overflow: 'hidden',
})

const Behind = styled('div', {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '8px',
  padding: '0 20px',
  background: '$stSunken',
  color: '$stMuted',
  fontFamily: '$inter',
  fontSize: '$caption',
  fontWeight: 600,
  transition: `background 120ms ${ease}, color 120ms ${ease}`,
  '& svg': { transition: `transform 160ms ${ease}` },
  variants: {
    armed: {
      true: {
        background: '$stAccent',
        color: '$stOnAccent',
        '& svg': { transform: 'scale(1.15)' },
      },
    },
    // The action revealed by swiping right sits on the left, in ink.
    start: {
      true: { justifyContent: 'flex-start' },
    },
  },
  compoundVariants: [
    {
      start: true,
      armed: true,
      css: { background: '$stInk', color: '$stCanvas' },
    },
  ],
})

const Front = styled('div', {
  position: 'relative',
  // Vertical scrolling stays with the browser; horizontal drags come here.
  touchAction: 'pan-y',
})

// How far a row must travel before letting go triggers the action.
const TRIGGER = 96

type SwipeActionProps = {
  label: string
  icon: ReactNode
  onAction: () => void
  // An optional second action, run by swiping to the right. The row springs
  // back in place afterwards instead of leaving.
  start?: {
    label: string
    icon: ReactNode
    onAction: () => void
  }
  disabled?: boolean
  children: ReactNode
}

// Past the trigger point the row moves at under half speed, so it feels held.
const resist = (dx: number) => {
  const distance = Math.abs(dx)
  return (
    Math.sign(dx) *
    (distance > TRIGGER ? TRIGGER + (distance - TRIGGER) * 0.45 : distance)
  )
}

// Swipe a row to the left on a touch screen to run its main action, such as
// archive, and optionally to the right for a second one. Mouse and keyboard
// use are unchanged.
export function SwipeAction(props: SwipeActionProps): JSX.Element {
  const [offset, setOffset] = useState(0)
  const [settling, setSettling] = useState(false)
  const start = useRef<{ x: number; y: number } | undefined>()
  const direction = useRef<'x' | 'y' | undefined>()
  const moved = useRef(false)

  if (props.disabled) {
    return <>{props.children}</>
  }

  const reset = () => {
    start.current = undefined
    direction.current = undefined
  }

  return (
    <Root>
      {offset < 0 && (
        <Behind armed={offset <= -TRIGGER} aria-hidden="true">
          {props.label}
          {props.icon}
        </Behind>
      )}
      {offset > 0 && props.start && (
        <Behind start armed={offset >= TRIGGER} aria-hidden="true">
          {props.start.icon}
          {props.start.label}
        </Behind>
      )}
      <Front
        style={{
          transform: offset ? `translateX(${offset}px)` : undefined,
          background: offset ? 'var(--colors-stSurface)' : undefined,
          transition: settling ? `transform 200ms ${ease}` : 'none',
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0]
          start.current = { x: touch.clientX, y: touch.clientY }
          direction.current = undefined
          moved.current = false
          setSettling(false)
        }}
        onTouchMove={(event) => {
          if (!start.current) {
            return
          }
          const touch = event.touches[0]
          const dx = touch.clientX - start.current.x
          const dy = touch.clientY - start.current.y
          if (!direction.current) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
              return
            }
            direction.current = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : 'y'
          }
          if (direction.current == 'x') {
            moved.current = true
            setOffset(resist(props.start ? dx : Math.min(0, dx)))
          }
        }}
        onTouchEnd={(event) => {
          const width = event.currentTarget.offsetWidth
          setSettling(true)
          if (offset <= -TRIGGER) {
            setOffset(-width)
            setTimeout(() => {
              props.onAction()
              // Stay off screen while the row leaves the list; come back
              // only if it is still there.
              setTimeout(() => {
                setSettling(false)
                setOffset(0)
              }, 400)
            }, 200)
          } else if (offset >= TRIGGER && props.start) {
            setOffset(0)
            props.start.onAction()
          } else {
            setOffset(0)
          }
          reset()
        }}
        onTouchCancel={() => {
          setSettling(true)
          setOffset(0)
          reset()
        }}
        onClickCapture={(event) => {
          // A swipe is not a tap on the row.
          if (moved.current) {
            event.stopPropagation()
            event.preventDefault()
            moved.current = false
          }
        }}
      >
        {props.children}
      </Front>
    </Root>
  )
}
