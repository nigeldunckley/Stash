import { ReactNode } from 'react'
import { styled } from '../../tokens/stitches.config'
import { motion, pressable } from './motion'

// A quiet, typographic empty or error state: a line glyph in a hairline
// tile, a short title, one line of help and an optional action.

const Root = styled('div', {
  display: 'grid',
  justifyItems: 'center',
  alignContent: 'center',
  gap: '6px',
  width: '100%',
  maxWidth: '420px',
  minHeight: '50vh',
  margin: '0 auto',
  padding: '48px 24px',
  boxSizing: 'border-box',
  fontFamily: '$inter',
  textAlign: 'center',
})

const Glyph = styled('div', {
  display: 'grid',
  placeItems: 'center',
  width: '52px',
  height: '52px',
  marginBottom: '12px',
  borderRadius: '12px',
  border: '1px solid $stLine',
  background: '$stSurface',
  color: '$stMuted',
  variants: {
    tone: { error: { color: '$stDanger' } },
  },
})

const Title = styled('h2', {
  margin: 0,
  fontFamily: '$inter',
  fontSize: '17px',
  fontWeight: 600,
  letterSpacing: '-0.015em',
  color: '$stInk',
})

const Body = styled('p', {
  margin: 0,
  fontSize: '$small',
  lineHeight: 1.55,
  color: '$stMuted',
  textWrap: 'pretty',
  a: { color: '$stInk2', textUnderlineOffset: '0.2em' },
})

const Action = styled('button', {
  all: 'unset',
  marginTop: '14px',
  height: '32px',
  padding: '0 14px',
  borderRadius: '$sm',
  background: '$stInk',
  color: '$stCanvas',
  fontSize: '$small',
  fontWeight: 500,
  cursor: 'pointer',
  transition: `opacity ${motion.fast}, transform ${motion.fast}`,
  ...pressable,
  '@media (hover: hover)': { '&:hover': { opacity: 0.88 } },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

export function EmptyState(props: {
  icon: ReactNode
  title: string
  children?: ReactNode
  action?: { label: string; onClick: () => void }
  tone?: 'error'
}): JSX.Element {
  return (
    <Root role={props.tone == 'error' ? 'alert' : 'status'}>
      <Glyph tone={props.tone} aria-hidden="true">
        {props.icon}
      </Glyph>
      <Title>{props.title}</Title>
      {props.children && <Body>{props.children}</Body>}
      {props.action && (
        <Action type="button" onClick={props.action.onClick}>
          {props.action.label}
        </Action>
      )}
    </Root>
  )
}
