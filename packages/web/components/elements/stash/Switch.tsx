import { styled } from '../../tokens/stitches.config'
import { motion } from './motion'

const Track = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  position: 'relative',
  flex: 'none',
  width: '30px',
  height: '18px',
  borderRadius: '999px',
  background: '$stLineStrong',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '&::after': {
    content: '""',
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    background: '$stSurface',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
    transition: `transform ${motion.fast}`,
  },
  '&[aria-checked="true"]': { background: '$stInk' },
  '&[aria-checked="true"]::after': {
    transform: 'translateX(12px)',
    background: '$stCanvas',
  },
  '&:disabled': { opacity: 0.5, cursor: 'default' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

// An on/off switch. The label is for screen readers; show a visible one
// beside it.
export function Switch(props: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}): JSX.Element {
  return (
    <Track
      type="button"
      role="switch"
      aria-label={props.label}
      aria-checked={props.checked}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    />
  )
}
