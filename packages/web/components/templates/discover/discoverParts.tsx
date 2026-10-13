import { ReactNode } from 'react'
import { FeedSuggestionReason } from '../../../lib/networking/feedSuggestions'
import { pressable, SiteIcon } from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import { guideIcon, isGuide } from './discoverText'

// Small pieces shared by the Discover page and its sheet.

export const Button = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  height: '34px',
  padding: '0 14px',
  borderRadius: '$sm',
  border: '1px solid $stLine',
  background: '$stSurface',
  color: '$stInk',
  fontFamily: '$inter',
  fontSize: '$small',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: `background ${motion.fast}, border-color ${motion.fast}, transform ${motion.fast}`,
  '@media (hover: hover)': {
    '&:hover:not(:disabled)': { borderColor: '$stLineStrong' },
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '&:disabled': { opacity: 0.5, cursor: 'default' },
  ...pressable,
  variants: {
    tone: {
      primary: {
        background: '$stInk',
        borderColor: '$stInk',
        color: '$stSurface',
        '@media (hover: hover)': {
          '&:hover:not(:disabled)': { borderColor: '$stInk', opacity: 0.88 },
        },
      },
      accent: {
        background: '$stAccent',
        borderColor: '$stAccent',
        color: '$stOnAccent',
        '@media (hover: hover)': {
          '&:hover:not(:disabled)': { borderColor: '$stAccent', opacity: 0.9 },
        },
      },
      quiet: {
        borderColor: 'transparent',
        background: 'transparent',
        color: '$stMuted',
        '@media (hover: hover)': {
          '&:hover:not(:disabled)': {
            color: '$stInk',
            borderColor: 'transparent',
          },
        },
      },
    },
    size: {
      large: { height: '42px', borderRadius: '$md', fontSize: '$body' },
    },
  },
})

// Mono label used above sections and for small facts.
export const Label = styled('span', {
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.02em',
  color: '$stMuted',
  textTransform: 'uppercase',
  fontVariantNumeric: 'tabular-nums',
})

export const Why = styled('span', {
  fontFamily: '$mono',
  fontSize: '$micro',
  lineHeight: 1.5,
  color: '$stAccentText',
})

export const Chip = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  height: '22px',
  padding: '0 8px',
  borderRadius: '$round',
  border: '1px solid $stLine',
  fontFamily: '$mono',
  fontSize: '10.5px',
  color: '$stInk2',
  whiteSpace: 'nowrap',
  variants: {
    accent: {
      true: {
        borderColor: 'transparent',
        background: '$stAccentTint',
        color: '$stAccentText',
      },
    },
  },
})

const PillRoot = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '26px',
  padding: '0 10px 0 4px',
  borderRadius: '$round',
  border: '1px solid $stLine',
  background: '$stSurface',
  fontFamily: '$inter',
  fontSize: '$caption',
  fontWeight: 500,
  letterSpacing: 'normal',
  textTransform: 'none',
  color: '$stInk2',
  whiteSpace: 'nowrap',
  maxWidth: '200px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  variants: {
    suggested: {
      true: {
        borderColor: '$stAccent',
        background: '$stAccentTint',
        color: '$stInk',
      },
    },
  },
})

export function Pill(props: {
  name: string
  icon?: string
  fallbackIcon?: string
  suggested?: boolean
}): JSX.Element {
  return (
    <PillRoot suggested={props.suggested}>
      <SiteIcon
        src={props.icon}
        fallbackSrc={props.fallbackIcon}
        name={props.name}
        size={18}
        round
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {props.name}
      </span>
    </PillRoot>
  )
}

const ChainRoot = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '6px',
  color: '$stMuted',
  fontFamily: '$mono',
  fontSize: '$caption',
})

// Your feeds that led here, either side of the suggestion: "Daring Fireball →
// Six Colors ← Kottke".
export function Chain(props: {
  reasons: FeedSuggestionReason[]
  children: ReactNode
}): JSX.Element | null {
  const guides = props.reasons.filter(isGuide).slice(0, 2)
  if (!guides.length) return null
  return (
    <ChainRoot aria-label="Who led you here">
      <Pill name={guides[0].guideName} icon={guideIcon(guides[0])} />
      <span aria-hidden="true">→</span>
      {props.children}
      {guides[1] && (
        <>
          <span aria-hidden="true">←</span>
          <Pill name={guides[1].guideName} icon={guideIcon(guides[1])} />
        </>
      )}
    </ChainRoot>
  )
}

// A tinted tile, for when a post has no picture. Each name gets its own tint
// so a row of them doesn't look like a row of blanks.
export const Tile = styled('div', {
  position: 'relative',
  overflow: 'hidden',
  background:
    'linear-gradient(135deg, $stSunken, color-mix(in srgb, $stSunken 70%, $stAccent 8%))',
  '& > span': {
    position: 'absolute',
    left: '10px',
    bottom: '6px',
    fontFamily: '$serif',
    fontSize: '40px',
    lineHeight: 1,
    color: '$stLineStrong',
  },
})

// Turns a suggestion down for good. On a card it floats over the top right
// corner: shown on hover with a pointer, always on touch screens.
export const NotForMe = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  position: 'relative',
  display: 'inline-grid',
  placeItems: 'center',
  flex: 'none',
  width: '26px',
  height: '26px',
  borderRadius: '$round',
  color: '$stMuted',
  cursor: 'pointer',
  transition: `color ${motion.fast}, background ${motion.fast}, opacity ${motion.fast}, transform ${motion.fast}`,
  ...pressable,
  '@media (pointer: coarse)': {
    '&::before': { content: '""', position: 'absolute', inset: '-9px' },
  },
  '@media (hover: hover)': {
    '&:hover': { color: '$stInk', background: '$stSunken' },
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  variants: {
    floating: {
      true: {
        position: 'absolute',
        top: '16px',
        right: '16px',
        zIndex: 1,
        color: '#fff',
        background: 'rgba(9, 9, 11, 0.42)',
        backdropFilter: 'blur(10px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.4)',
        boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.14)',
        '@media (hover: hover)': {
          opacity: 0,
          transform: 'scale(0.9)',
          '&:hover': { color: '#fff', background: 'rgba(9, 9, 11, 0.62)' },
          'article:hover > &, article:focus-within > &, &:focus-visible': {
            opacity: 1,
            transform: 'none',
          },
        },
      },
    },
  },
})
