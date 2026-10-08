import * as RadixPopover from '@radix-ui/react-popover'
import { ReactNode } from 'react'
import { keyframes, styled } from '../../tokens/stitches.config'
import { reducedMotion } from './motion'

const appear = keyframes({
  from: { opacity: 0, transform: 'translateY(-4px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
})

const Content = styled(RadixPopover.Content, {
  zIndex: 30,
  minWidth: '220px',
  maxWidth: 'calc(100vw - 32px)',
  padding: '14px',
  boxSizing: 'border-box',
  background: '$stSurface',
  color: '$stInk',
  border: '1px solid $stLine',
  borderRadius: '$lg',
  boxShadow:
    '0 1px 2px rgba(9, 9, 11, 0.06), 0 12px 32px -8px rgba(9, 9, 11, 0.18)',
  fontFamily: '$inter',
  fontSize: '$small',
  animation: `${appear} 160ms cubic-bezier(0.2, 0, 0, 1)`,
  '&:focus': { outline: 'none' },
  [reducedMotion]: { animation: 'none' },
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
