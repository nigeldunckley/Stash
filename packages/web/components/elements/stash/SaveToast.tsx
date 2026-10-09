import toast from 'react-hot-toast'
import { WarningCircle } from '@phosphor-icons/react'
import { keyframes, styled } from '../../tokens/stitches.config'
import { motion } from './motion'

// The toast for a link saved inside Stash. It updates in place as the save
// goes through: saving, saved (with the title once the page is read),
// already in Stash, or a plain explanation when something went wrong.

const Card = styled('div', {
  display: 'grid',
  gap: '6px',
  width: 'min(340px, calc(100vw - 32px))',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: '$md',
  background: '$stSurface',
  border: '1px solid $stLine',
  color: '$stInk',
  fontFamily: '$inter',
  boxShadow: '0 16px 36px -18px rgba(9, 9, 11, 0.4)',
  transition: `opacity ${motion.base}, transform ${motion.base}`,
  '&[data-visible="false"]': { opacity: 0, transform: 'translateY(8px)' },
  '@mdDown': { marginBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' },
})

const Head = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13.5px',
  fontWeight: 600,
})

const spin = keyframes({ to: { transform: 'rotate(360deg)' } })

const Spinner = styled('span', {
  width: '14px',
  height: '14px',
  flex: 'none',
  boxSizing: 'border-box',
  borderRadius: '50%',
  border: '2px solid $stLine',
  borderTopColor: '$stAccent',
  animation: `${spin} 700ms linear infinite`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
})

const Dot = styled('span', {
  display: 'grid',
  placeItems: 'center',
  width: '16px',
  height: '16px',
  flex: 'none',
  borderRadius: '50%',
  color: '$stOnAccent',
  background: '$stAccent',
  variants: {
    tone: {
      accent: {},
      ink: { background: '$stInk', color: '$stSurface' },
      warn: { background: 'transparent', color: '$stAccentText' },
    },
  },
})

const Title = styled('div', {
  fontFamily: '$serif',
  fontSize: '16px',
  lineHeight: 1.3,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const Placeholder = styled('div', {
  height: '10px',
  width: '78%',
  margin: '4px 0',
  borderRadius: '3px',
  background: '$stLine',
})

const Detail = styled('div', {
  fontFamily: '$mono',
  fontSize: '11px',
  color: '$stMuted',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

const Body = styled('div', {
  fontSize: '12.5px',
  lineHeight: 1.45,
  color: '$stMuted',
})

const Actions = styled('div', {
  display: 'flex',
  gap: '6px',
  marginTop: '4px',
})

const Action = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  height: '30px',
  padding: '0 12px',
  fontSize: '13px',
  fontWeight: 500,
  borderRadius: '$sm',
  border: '1px solid $stLine',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  variants: {
    primary: {
      true: {
        color: '$stOnAccent',
        background: '$stAccent',
        borderColor: '$stAccent',
        '&:hover': { background: '$stAccent', filter: 'brightness(1.05)' },
      },
    },
  },
})

export type SaveToastAction = {
  label: string
  onClick: () => void
  primary?: boolean
}

export type SaveToastState =
  | { kind: 'saving'; host: string }
  | {
      kind: 'saved'
      host: string
      title?: string
      detail?: string
      actions: SaveToastAction[]
    }
  | {
      kind: 'already'
      host: string
      title?: string
      detail?: string
      actions: SaveToastAction[]
    }
  | {
      kind: 'partial' | 'failed'
      host: string
      message: string
      actions: SaveToastAction[]
    }

const HEADINGS = {
  saving: 'Saving to Stash…',
  saved: 'Saved to Stash',
  already: 'Already in Stash',
  partial: 'Saved the link, not the text',
  failed: 'Not saved',
}

const DURATIONS = {
  saving: Infinity,
  saved: 6000,
  already: 6000,
  partial: 9000,
  failed: 9000,
}

const tick = (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path
      d="m2 5 2 2 4-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// Shows the toast, or updates it when `id` is the one returned before.
export const showSaveToast = (
  state: SaveToastState,
  id?: string,
  duration?: number
): string =>
  toast.custom(
    (t) => (
      <Card role="status" aria-live="polite" data-visible={t.visible}>
        <Head>
          {state.kind == 'saving' && <Spinner aria-hidden="true" />}
          {state.kind == 'saved' && <Dot tone="accent">{tick}</Dot>}
          {state.kind == 'already' && <Dot tone="ink">{tick}</Dot>}
          {(state.kind == 'partial' || state.kind == 'failed') && (
            <Dot tone="warn">
              <WarningCircle size={16} weight="fill" aria-hidden="true" />
            </Dot>
          )}
          {HEADINGS[state.kind]}
        </Head>
        {state.kind == 'saving' && <Placeholder aria-hidden="true" />}
        {(state.kind == 'saved' || state.kind == 'already') &&
          (state.title ? (
            <Title>{state.title}</Title>
          ) : (
            <Placeholder aria-hidden="true" />
          ))}
        {(state.kind == 'partial' || state.kind == 'failed') && (
          <Body>{state.message}</Body>
        )}
        <Detail>
          {'detail' in state && state.detail
            ? `${state.host} · ${state.detail}`
            : state.host}
        </Detail>
        {'actions' in state && state.actions.length > 0 && (
          <Actions>
            {state.actions.map((action) => (
              <Action
                key={action.label}
                type="button"
                primary={action.primary}
                onClick={() => {
                  toast.dismiss(t.id)
                  action.onClick()
                }}
              >
                {action.label}
              </Action>
            ))}
          </Actions>
        )}
      </Card>
    ),
    {
      id,
      duration: duration ?? DURATIONS[state.kind],
      position:
        typeof window != 'undefined' && window.innerWidth <= 768
          ? 'bottom-center'
          : 'bottom-right',
    }
  )
