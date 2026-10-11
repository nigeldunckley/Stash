import { useEffect, useState } from 'react'
import { styled } from '../../tokens/stitches.config'
import { motion } from './motion'

// Safari 17.4 and later draws <input type="checkbox" switch> as the system
// switch: the iOS one, with a haptic tick, on iPhone and the macOS one on a
// Mac. Other browsers get the drawn version below.
const Input = styled('input', {
  flex: 'none',
  margin: 0,
  cursor: 'pointer',
  accentColor: '$stAccent',
  '&:disabled': { opacity: 0.5, cursor: 'default' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '&:not([data-native])': {
    appearance: 'none',
    WebkitAppearance: 'none',
    position: 'relative',
    boxSizing: 'border-box',
    width: '30px',
    height: '18px',
    borderRadius: '999px',
    background: '$stLineStrong',
    transition: `background ${motion.fast}`,
    '&::after': {
      content: '""',
      position: 'absolute',
      top: '2px',
      left: '2px',
      width: '14px',
      height: '14px',
      borderRadius: '50%',
      background: '#FFFFFF',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
      transition: `transform ${motion.base}`,
    },
    '&:checked': { background: '$stAccent' },
    '&:checked::after': { transform: 'translateX(12px)' },
  },
})

const supportsNativeSwitch = (): boolean =>
  typeof window !== 'undefined' && 'switch' in HTMLInputElement.prototype

// An on/off switch. The label is for screen readers; show a visible one
// beside it.
export function Switch(props: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}): JSX.Element {
  const [native, setNative] = useState(false)
  useEffect(() => setNative(supportsNativeSwitch()), [])

  return (
    <Input
      type="checkbox"
      role="switch"
      // React passes unknown attributes through as strings.
      {...({ switch: '' } as Record<string, string>)}
      data-native={native ? '' : undefined}
      aria-label={props.label}
      checked={props.checked}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.checked)}
    />
  )
}
