import React from 'react'
import { styled } from '@omnivore/web/components/tokens/stitches.config'
import {
  motion,
  pressable,
} from '@omnivore/web/components/elements/stash/motion'

// The app's colophon at the end of an article, laid out like the web's
// FinishCard. The app works out the facts and what to read next, puts them
// in window.stashColophon, and carries out the button the reader picks.
const Card = styled('section', {
  display: 'grid',
  gap: '22px',
  width: '100%',
  boxSizing: 'border-box',
  margin: '56px 0 24px',
  paddingTop: '14px',
  fontFamily: '$inter',
  color: '$stInk',
  borderTop: '1px solid $stInk',
})

const Facts = styled('dl', {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '16px',
  margin: 0,
  '@smDown': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  '& > div': { display: 'grid', gap: '4px', minWidth: 0 },
  dt: {
    fontFamily: '$mono',
    fontSize: '10px',
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: '$stMuted',
  },
  dd: {
    margin: 0,
    fontFamily: '$mono',
    fontSize: '13px',
    color: '$stInk',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
})

const Buttons = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px',
})

const Button = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '34px',
  padding: '0 14px',
  fontSize: '14px',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  borderRadius: '$sm',
  cursor: 'pointer',
  transition: `background ${motion.fast}, border-color ${motion.fast}`,
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '&:disabled': { opacity: 0.6, cursor: 'default' },
  ...pressable,
  variants: {
    primary: {
      true: {
        color: '$stSurface',
        background: '$stInk',
        '&:hover': { opacity: 0.88 },
      },
      false: {
        color: '$stInk',
        border: '1px solid $stLine',
        '&:hover': { background: '$stSunken' },
      },
    },
  },
  defaultVariants: { primary: false },
})

const Next = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'grid',
  gap: '4px',
  padding: '16px 18px',
  border: '1px solid $stLine',
  borderRadius: '$md',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

const NextKicker = styled('div', {
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: '$stAccentText',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const NextTitle = styled('div', {
  fontFamily: '$serif',
  fontSize: '19px',
  fontWeight: 500,
  lineHeight: 1.25,
  letterSpacing: '-0.01em',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

export function Colophon({ data }) {
  const [busy, setBusy] = React.useState(false)
  const choose = (choice) => {
    setBusy(true)
    window.webkit?.messageHandlers?.stashColophon?.postMessage({ choice })
  }
  const { facts = [], next, archived, canClose } = data

  return (
    <Card aria-label="Finished reading">
      {facts.length > 0 && (
        <Facts>
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </Facts>
      )}
      {next && (
        <Next type="button" disabled={busy} onClick={() => choose('next')}>
          <NextKicker>{next.kicker}</NextKicker>
          <NextTitle>{next.title}</NextTitle>
        </Next>
      )}
      <Buttons>
        {next && (
          <Button
            type="button"
            primary
            disabled={busy}
            onClick={() => choose(archived ? 'next' : 'archiveNext')}
          >
            {archived ? 'Read next' : 'Archive and read next'}
          </Button>
        )}
        {!archived && (
          <Button
            type="button"
            primary={!next}
            disabled={busy}
            onClick={() => choose('archive')}
          >
            {canClose ? 'Archive and close' : 'Archive'}
          </Button>
        )}
        {canClose && (
          <Button
            type="button"
            primary={archived && !next}
            disabled={busy}
            onClick={() => choose('close')}
          >
            {archived ? 'Back to Stash' : 'Keep in Saved'}
          </Button>
        )}
      </Buttons>
    </Card>
  )
}
