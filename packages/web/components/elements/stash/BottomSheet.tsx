import * as Dialog from '@radix-ui/react-dialog'
import { ReactNode } from 'react'
import { keyframes, styled } from '../../tokens/stitches.config'
import { motion, reducedMotion } from './motion'

const slideUp = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
})

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
})

const Overlay = styled(Dialog.Overlay, {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  background: '$stScrim',
  animation: `${fadeIn} ${motion.base}`,
  [reducedMotion]: { animation: 'none' },
})

const Content = styled(Dialog.Content, {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 41,
  maxHeight: '85dvh',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  background: '$stSurface',
  color: '$stInk',
  borderTop: '1px solid $stLine',
  borderRadius: '16px 16px 0 0',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  fontFamily: '$inter',
  boxShadow: '0 -12px 40px -16px rgba(9, 9, 11, 0.3)',
  animation: `${slideUp} ${motion.sheet}`,
  '&:focus': { outline: 'none' },
  [reducedMotion]: { animation: `${fadeIn} 150ms linear` },
})

const Grabber = styled('div', {
  width: '36px',
  height: '4px',
  borderRadius: '4px',
  background: '$stLineStrong',
  margin: '8px auto 4px',
  flex: 'none',
})

const Header = styled('div', {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 16px 10px',
  borderBottom: '1px solid $stLine',
  flex: 'none',
})

const Title = styled(Dialog.Title, {
  margin: 0,
  fontSize: '$ui',
  fontWeight: 600,
  letterSpacing: '-0.01em',
})

const Body = styled('div', {
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  WebkitOverflowScrolling: 'touch',
  padding: '14px 16px 18px',
})

type BottomSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  headerAction?: ReactNode
  children: ReactNode
}

// A sheet that slides up from the bottom of the screen. Used on iPhone in place
// of side panels and popovers.
export const BottomSheet = (props: BottomSheetProps): JSX.Element => {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Overlay />
        <Content aria-describedby={undefined}>
          <Grabber />
          <Header>
            <Title>{props.title}</Title>
            {props.headerAction && (
              <div style={{ marginLeft: 'auto' }}>{props.headerAction}</div>
            )}
          </Header>
          <Body>{props.children}</Body>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
