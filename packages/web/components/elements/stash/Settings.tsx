import { Check } from '@phosphor-icons/react'
import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import { keyframes, styled } from '../../tokens/stitches.config'
import { motion, pressable, reducedMotion } from './motion'

// Grouped settings in the style of macOS System Settings and iOS Settings:
// a small heading, an inset card of rows split by hairlines, and a footnote.

export const SettingsTitle = styled('h1', {
  margin: '0 0 6px',
  fontFamily: '$inter',
  fontSize: '28px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: '$stInk',
})

export const SettingsLede = styled('p', {
  margin: '0 0 28px',
  fontSize: '$body',
  lineHeight: 1.55,
  color: '$stMuted',
  maxWidth: '60ch',
})

const GroupRoot = styled('section', {
  margin: '0 0 28px',
  fontFamily: '$inter',
})

const GroupHeading = styled('h2', {
  margin: '0 0 8px 14px',
  fontFamily: '$mono !important',
  fontSize: '11px',
  fontWeight: 400,
  letterSpacing: '0.06em !important',
  textTransform: 'uppercase',
  color: '$stMuted !important',
})

const Card = styled('div', {
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '10px',
  overflow: 'hidden',
  // Hairlines between rows, inset from the leading edge like iOS.
  '& > *': { position: 'relative' },
  '& > * + *::before': {
    content: '',
    position: 'absolute',
    top: 0,
    left: '14px',
    right: 0,
    height: '1px',
    background: '$stLine',
    pointerEvents: 'none',
  },
})

const Footnote = styled('p', {
  margin: '8px 14px 0',
  fontSize: '$caption',
  lineHeight: 1.5,
  color: '$stMuted',
  maxWidth: '64ch',
  variants: {
    tone: {
      error: { color: '$stDanger' },
      ok: { color: '$stInk2' },
    },
  },
})

export function SettingsGroup(props: {
  title?: string
  footer?: ReactNode
  footerTone?: 'error' | 'ok'
  children: ReactNode
}): JSX.Element {
  return (
    <GroupRoot>
      {props.title && <GroupHeading>{props.title}</GroupHeading>}
      <Card>{props.children}</Card>
      {props.footer && (
        <Footnote tone={props.footerTone} aria-live="polite">
          {props.footer}
        </Footnote>
      )}
    </GroupRoot>
  )
}

const RowRoot = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  minHeight: '44px',
  padding: '6px 14px',
  boxSizing: 'border-box',
  fontSize: '14px',
  color: '$stInk',
  '& > label, & > span:first-child': { flex: 'none' },
})

const RowValue = styled('div', {
  marginLeft: 'auto',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '8px',
  color: '$stMuted',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
})

export function SettingsRow(props: {
  label: ReactNode
  htmlFor?: string
  children?: ReactNode
}): JSX.Element {
  return (
    <RowRoot>
      {props.htmlFor ? (
        <label htmlFor={props.htmlFor}>{props.label}</label>
      ) : (
        <span>{props.label}</span>
      )}
      <RowValue>{props.children}</RowValue>
    </RowRoot>
  )
}

const RowButtonRoot = styled('button', {
  all: 'unset',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  minHeight: '44px',
  padding: '6px 14px',
  boxSizing: 'border-box',
  fontFamily: '$inter',
  fontSize: '14px',
  fontWeight: 500,
  color: '$stAccentText',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '@media (hover: hover)': {
    '&:hover:not(:disabled)': { background: '$stSunken' },
  },
  '&:active:not(:disabled)': { background: '$stSunken' },
  '&:disabled': { color: '$stMuted', cursor: 'default' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-2px' },
  variants: {
    destructive: { true: { color: '$stDanger' } },
  },
})

export function SettingsRowButton(props: {
  children: ReactNode
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
}): JSX.Element {
  return (
    <RowButtonRoot
      type="button"
      destructive={props.destructive}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </RowButtonRoot>
  )
}

const Input = styled('input', {
  all: 'unset',
  flex: 1,
  minWidth: 0,
  width: '100%',
  maxWidth: '320px',
  fontFamily: '$inter',
  fontSize: '14px',
  color: '$stInk',
  textAlign: 'right',
  // The layout's generic input styling doesn't belong inside a row.
  border: 'none !important',
  background: 'transparent !important',
  boxShadow: 'none !important',
  '&:focus': { color: '$stInk' },
  '&::placeholder': { color: '$stMuted' },
  '&:disabled': { color: '$stMuted' },
  '@mdDown': { fontSize: '16px' },
})

const pop = keyframes({
  from: { opacity: 0, transform: 'scale(0.6)' },
  to: { opacity: 1, transform: 'scale(1)' },
})

const Saved = styled('span', {
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  width: '16px',
  color: '$stAccent',
  animation: `${pop} ${motion.base} both`,
  [reducedMotion]: { animation: 'none' },
})

type SaveState = 'idle' | 'saving' | 'saved'

// A text field that saves when it loses focus or on Return, then shows a
// brief ✓. Escape puts the saved value back.
export function SettingsTextField(props: {
  label: string
  value: string
  placeholder?: string
  type?: 'text' | 'email'
  autoComplete?: string
  onChange?: (value: string) => void
  onSave: (value: string) => Promise<boolean>
}): JSX.Element {
  const id = useId()
  const [draft, setDraft] = useState(props.value)
  const [state, setState] = useState<SaveState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => setDraft(props.value), [props.value])
  useEffect(() => () => clearTimeout(timer.current), [])

  const save = async () => {
    const value = draft.trim()
    if (!value || value == props.value) {
      setDraft(props.value)
      return
    }
    setState('saving')
    const ok = await props.onSave(value)
    if (!ok) {
      setDraft(props.value)
      setState('idle')
      return
    }
    setState('saved')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1600)
  }

  return (
    <SettingsRow label={props.label} htmlFor={id}>
      <Input
        id={id}
        type={props.type ?? 'text'}
        value={draft}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        spellCheck={false}
        disabled={state == 'saving'}
        onChange={(event) => {
          setDraft(event.target.value)
          props.onChange?.(event.target.value)
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key == 'Enter') {
            event.currentTarget.blur()
          } else if (event.key == 'Escape') {
            setDraft(props.value)
            props.onChange?.(props.value)
            const input = event.currentTarget
            setTimeout(() => input.blur(), 0)
          }
        }}
      />
      {state == 'saved' && (
        <Saved role="status" aria-label="Saved">
          <Check size={14} weight="bold" />
        </Saved>
      )}
    </SettingsRow>
  )
}

export const SettingsMeter = styled('div', {
  position: 'relative',
  width: '120px',
  height: '4px',
  borderRadius: '2px',
  background: '$stSunken',
  overflow: 'hidden',
  '& > i': {
    position: 'absolute',
    inset: '0 auto 0 0',
    borderRadius: 'inherit',
    background: '$stAccent',
  },
})

export const SettingsLink = styled('a', {
  color: '$stAccentText !important',
  textDecoration: 'none',
  fontWeight: 500,
  ...pressable,
})
