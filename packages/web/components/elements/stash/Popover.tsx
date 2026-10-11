import * as RadixPopover from '@radix-ui/react-popover'
import { ReactNode } from 'react'
import { keyframes, styled } from '../../tokens/stitches.config'
import { floatingShadow, glassStrong, hairlineEdge } from './material'
import { reducedMotion, spring } from './motion'

// Grows out of the button that opened it.
const appear = keyframes({
  from: { opacity: 0, transform: 'scale(0.96)' },
  to: { opacity: 1, transform: 'scale(1)' },
})

const fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })

const Content = styled(RadixPopover.Content, {
  zIndex: 30,
  minWidth: '220px',
  maxWidth: 'calc(100vw - 32px)',
  padding: '14px',
  boxSizing: 'border-box',
  ...glassStrong,
  ...hairlineEdge,
  color: '$stInk',
  borderRadius: '$lg',
  boxShadow: floatingShadow,
  fontFamily: '$inter',
  fontSize: '$small',
  transformOrigin: 'var(--radix-popover-content-transform-origin)',
  animation: `${appear} 240ms ${spring}`,
  '&:focus': { outline: 'none' },
  [reducedMotion]: { animation: `${fade} 150ms linear` },
})

type PopoverProps = {
  trigger: ReactNode
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  label?: string
}

// A floating panel anchored to its trigger. The trigger must be a single
// focusable element, such as an IconButton.
export const Popover = (props: PopoverProps): JSX.Element => {
  return (
    <RadixPopover.Root open={props.open} onOpenChange={props.onOpenChange}>
      <RadixPopover.Trigger asChild>{props.trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <Content
          align={props.align ?? 'end'}
          side={props.side ?? 'bottom'}
          sideOffset={8}
          collisionPadding={16}
          aria-label={props.label}
        >
          {props.children}
        </Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}

// A small uppercase label for groups inside popovers and panels.
export const PanelLabel = styled('div', {
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: '$stMuted',
})
