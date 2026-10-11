import toast from 'react-hot-toast'
import { styled } from '../../tokens/stitches.config'
import { floatingShadow, glassStrong, hairlineEdge } from './material'
import { motion, reducedMotion } from './motion'

const Root = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  height: '40px',
  padding: '0 6px 0 14px',
  borderRadius: '12px',
  ...glassStrong,
  ...hairlineEdge,
  boxShadow: floatingShadow,
  color: '$stInk',
  fontFamily: '$inter',
  fontSize: '$small',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  transition: `opacity ${motion.base}, transform ${motion.base}`,
  '&[data-visible="false"]': {
    opacity: 0,
    transform: 'translateY(10px) scale(0.98)',
  },
  [reducedMotion]: {
    '&[data-visible="false"]': { transform: 'none' },
  },
  '@mdDown': { marginBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' },
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
  color: '$stAccentText',
  cursor: 'pointer',
  '@media (hover: hover)': {
    '&:hover': { background: 'rgba(127, 127, 127, 0.14)' },
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
})

// A small frosted toast at the bottom of the screen, with an Undo button when
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
