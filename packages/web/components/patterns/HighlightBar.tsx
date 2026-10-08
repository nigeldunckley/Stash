import { Check, Copy, NotePencil, Tag } from '@phosphor-icons/react'
import { isAndroid } from '../../lib/deviceType'
import { highlightColor, highlightColors } from '../../lib/themeUpdater'
import { motion } from '../elements/stash/motion'
import { styled } from '../tokens/stitches.config'

type PageCoordinates = {
  pageX: number
  pageY: number
}

export type HighlightAction =
  | 'delete'
  | 'create'
  | 'comment'
  | 'share'
  | 'post'
  | 'unshare'
  | 'setHighlightLabels'
  | 'copy'
  | 'updateColor'

type HighlightBarProps = {
  anchorCoordinates: PageCoordinates
  isNewHighlight: boolean
  isSharedToFeed: boolean
  displayAtBottom: boolean
  highlightColor?: string
  handleButtonClick: (action: HighlightAction, param?: string) => void
}

// The bar is always dark, in every theme, so it reads as a tool over the text.
const Pill = styled('div', {
  zIndex: 999,
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '4px',
  boxSizing: 'border-box',
  background: '#18181B',
  color: '#FAFAFA',
  border: '1px solid #27272A',
  borderRadius: '$md',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18), 0 1px 2px rgba(0, 0, 0, 0.2)',
  fontFamily: '$inter',
  fontSize: '$caption',
  whiteSpace: 'nowrap',
})

const Swatch = styled('button', {
  all: 'unset',
  display: 'grid',
  placeItems: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '$sm',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '&:hover': { background: 'rgba(255, 255, 255, 0.08)' },
  '&:focus-visible': { boxShadow: '0 0 0 2px #FF4F00' },
  '& > span': {
    display: 'grid',
    placeItems: 'center',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    color: '#09090B',
    boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.15)',
  },
  variants: {
    touch: { true: { width: '40px', height: '40px' } },
  },
})

const Action = styled('button', {
  all: 'unset',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '28px',
  padding: '0 9px',
  borderRadius: '$sm',
  cursor: 'pointer',
  color: '#D4D4D8',
  transition: `background ${motion.fast}, color ${motion.fast}`,
  '&:hover': { background: 'rgba(255, 255, 255, 0.08)', color: '#FAFAFA' },
  '&:focus-visible': { boxShadow: '0 0 0 2px #FF4F00' },
  variants: {
    touch: { true: { height: '40px', padding: '0 12px' } },
  },
})

const Divider = styled('span', {
  width: '1px',
  height: '18px',
  margin: '0 4px',
  background: '#3F3F46',
})

export function HighlightBar(props: HighlightBarProps): JSX.Element {
  const touch = props.displayAtBottom
  const position = touch
    ? {
        position: 'fixed' as const,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'calc(100vw - 24px)',
        bottom: `calc(${
          isAndroid() ? 58 : 28
        }px + env(safe-area-inset-bottom, 0px))`,
      }
    : {
        position: 'absolute' as const,
        left: props.anchorCoordinates.pageX,
        top: props.anchorCoordinates.pageY,
      }

  return (
    <Pill style={position} role="toolbar" aria-label="Highlight">
      {highlightColors.map((color) => {
        const current = !props.isNewHighlight && props.highlightColor == color
        return (
          <Swatch
            key={color}
            touch={touch}
            title={
              props.isNewHighlight
                ? `Highlight ${color}`
                : current
                ? 'Remove highlight'
                : `Change to ${color}`
            }
            aria-pressed={current}
            onClick={() => {
              if (props.isNewHighlight) {
                props.handleButtonClick('create', color)
              } else if (current) {
                props.handleButtonClick('delete')
              } else {
                props.handleButtonClick('updateColor', color)
              }
            }}
          >
            <span style={{ background: highlightColor(color) }}>
              {current && <Check size={10} weight="bold" />}
            </span>
          </Swatch>
        )
      })}
      <Divider />
      <Action touch={touch} onClick={() => props.handleButtonClick('comment')}>
        <NotePencil size={15} />
        Note
      </Action>
      {!props.isNewHighlight && (
        <Action
          touch={touch}
          onClick={() => props.handleButtonClick('setHighlightLabels')}
        >
          <Tag size={15} />
          Labels
        </Action>
      )}
      <Action touch={touch} onClick={() => props.handleButtonClick('copy')}>
        <Copy size={15} />
        Copy
      </Action>
    </Pill>
  )
}
