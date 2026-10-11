import { forwardRef, ReactNode } from 'react'
import { styled } from '../../tokens/stitches.config'
import { motion, pressable } from './motion'

const Button = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-grid',
  placeItems: 'center',
  flex: 'none',
  cursor: 'pointer',
  color: '$stMuted',
  border: '1px solid transparent',
  borderRadius: '$sm',
  position: 'relative',
  transition: `color ${motion.fast}, background ${motion.fast}, border-color ${motion.fast}, transform ${motion.fast}`,
  ...pressable,
  // On touch screens the target is at least 44pt, whatever the drawn size.
  '@media (pointer: coarse)': {
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 'min(-7px, calc((100% - 44px) / 2))',
    },
  },
  // Hover only where there is a pointer, so a tap on iPhone doesn't leave
  // the button lit.
  '@media (hover: hover)': {
    '&:hover': {
      color: '$stInk',
      background: '$stSurface',
      borderColor: '$stLine',
    },
  },
  '&:focus-visible': {
    outline: '2px solid $stAccent',
    outlineOffset: '1px',
  },
  '&:disabled': {
    opacity: 0.4,
    cursor: 'default',
  },
  variants: {
    size: {
      sm: { width: '26px', height: '26px' },
      md: { width: '30px', height: '30px' },
      lg: { width: '36px', height: '36px' },
    },
    active: {
      true: {
        color: '$stInk',
        background: '$stSunken',
        borderColor: '$stLine',
      },
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

type IconButtonProps = {
  label: string
  shortcut?: string
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  disabled?: boolean
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}

// A square, borderless icon button. The label is used for screen readers and,
// together with the shortcut, for the native tooltip.
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(props, ref) {
    const { label, shortcut, size, active, children, ...rest } = props
    return (
      <Button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={active}
        title={shortcut ? `${label}  ${shortcut}` : label}
        size={size}
        active={active}
        {...rest}
      >
        {children}
      </Button>
    )
  }
)
