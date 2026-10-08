import toast from 'react-hot-toast'
import { styled } from '../../tokens/stitches.config'
import { motion } from './motion'

const Root = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  height: '38px',
  padding: '0 6px 0 12px',
  borderRadius: '10px',
  background: '$stInk',
  color: '$stCanvas',
  fontFamily: '$inter',
  fontSize: '$small',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  transition: `opacity ${motion.base}, transform ${motion.base}`,
  '&[data-visible="false"]': { opacity: 0, transform: 'translateY(8px)' },
  '@mdDown': { marginBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' },
})

const Mark = styled('span', {
  width: '8px',
  height: '8px',
  borderRadius: '2px',
  background: '$stAccent',
  flex: 'none',
})

const Undo = styled('button', {
  all: 'unset',
  display: 'inline-flex',
  alignItems: 'center',
  height: '28px',
  padding: '0 9px',
  borderRadius: '6px',
  fontWeight: 600,
  color: '$stAccent',
  cursor: 'pointer',
  '&:hover': { background: 'rgba(127, 127, 127, 0.18)' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
})

// A small dark toast at the bottom of the screen, with an Undo button when
// the action can be reversed.
export const showUndoToast = (
  message: string,
  undo?: () => void | Promise<void>
): string =>
  toast.custom(
    (t) => (
      <Root role="status" data-visible={t.visible}>
        <Mark aria-hidden="true" />
        {message}
        {undo && (
          <Undo
            type="button"
            onClick={() => {
              toast.dismiss(t.id)
              undo()
            }}
          >
            Undo
          </Undo>
        )}
      </Root>
    ),
    { position: 'bottom-center', duration: undo ? 4500 : 2000 }
  )
