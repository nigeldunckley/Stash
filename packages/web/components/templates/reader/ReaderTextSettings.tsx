import { Minus, Plus } from '@phosphor-icons/react'
import { ReaderSettings } from '../../../lib/hooks/useReaderSettings'
import { useCurrentTheme } from '../../../lib/hooks/useCurrentTheme'
import { PanelLabel } from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'

const Stack = styled('div', {
  display: 'grid',
  gap: '10px',
  width: '264px',
  maxWidth: '100%',
})

const Options = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '6px',
  variants: {
    four: { true: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' } },
  },
})

const Option = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  cursor: 'pointer',
  textAlign: 'center',
  padding: '7px 4px',
  fontSize: '$caption',
  color: '$stInk',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '8px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  transition: `border-color ${motion.fast}, box-shadow ${motion.fast}`,
  '&:hover': { borderColor: '$stLineStrong' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  '&[aria-checked="true"]': {
    borderColor: '$stAccent',
    boxShadow: 'inset 0 0 0 1px $colors$stAccent',
  },
})

const Swatch = styled(Option, {
  height: '34px',
  padding: 0,
  display: 'grid',
  placeItems: 'center',
})

const Stepper = styled('div', {
  display: 'grid',
  gridTemplateColumns: '32px minmax(0, 1fr) 32px',
  alignItems: 'center',
  gap: '8px',
  button: {
    all: 'unset',
    boxSizing: 'border-box',
    cursor: 'pointer',
    height: '30px',
    display: 'grid',
    placeItems: 'center',
    color: '$stInk',
    border: '1px solid $stLine',
    borderRadius: '7px',
    '&:hover': { borderColor: '$stLineStrong' },
    '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  },
})

const Track = styled('div', {
  position: 'relative',
  height: '2px',
  background: '$stLine',
  span: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    background: '$stAccent',
  },
})

const MoreLink = styled('button', {
  all: 'unset',
  cursor: 'pointer',
  justifySelf: 'start',
  marginTop: '2px',
  fontSize: '$caption',
  color: '$stMuted',
  '&:hover': { color: '$stInk' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

const THEMES = [
  { id: 'Light', label: 'Light', bg: '#FFFFFF', fg: '#18181B' },
  { id: 'Apollo', label: 'Dim', bg: '#18181B', fg: '#E4E4E7' },
  { id: 'Dark', label: 'Dark', bg: '#09090B', fg: '#E4E4E7' },
  {
    id: 'System',
    label: 'Auto',
    bg: 'linear-gradient(135deg, #FFFFFF 50%, #09090B 50%)',
    fg: '#71717A',
  },
]

const FONTS = [
  {
    id: 'Newsreader',
    label: 'Newsreader',
    css: "'Newsreader', Georgia, serif",
  },
  { id: 'Literata', label: 'Literata', css: "'Literata', Georgia, serif" },
  { id: 'Geist', label: 'Geist', css: "'Geist', system-ui, sans-serif" },
]

// Width is stored as the reader's margin: a larger margin is a narrower column.
// Column widths as margins (the column is 1024 minus this). Standard gives
// about 66 characters a line in Newsreader at 20px.
const WIDTHS = [
  { label: 'Narrow', margin: 480 },
  { label: 'Standard', margin: 420 },
  { label: 'Wide', margin: 300 },
]

const SPACINGS = [
  { label: 'Tight', value: 145 },
  { label: 'Normal', value: 160 },
  { label: 'Loose', value: 180 },
]

const MIN_SIZE = 14
const MAX_SIZE = 28

const nearest = <T,>(items: T[], value: number, key: (item: T) => number) =>
  items.reduce((best, item) =>
    Math.abs(key(item) - value) < Math.abs(key(best) - value) ? item : best
  )

type ReaderTextSettingsProps = {
  readerSettings: ReaderSettings
  onShowAllSettings: () => void
}

export function ReaderTextSettings(
  props: ReaderTextSettingsProps
): JSX.Element {
  const { readerSettings } = props
  const { currentTheme, setCurrentTheme } = useCurrentTheme()
  const width = nearest(WIDTHS, readerSettings.marginWidth, (w) => w.margin)
  const spacing = nearest(SPACINGS, readerSettings.lineHeight, (s) => s.value)
  const sizePercent =
    ((readerSettings.fontSize - MIN_SIZE) / (MAX_SIZE - MIN_SIZE)) * 100

  return (
    <Stack>
      <PanelLabel>Theme</PanelLabel>
      <Options four role="radiogroup" aria-label="Theme">
        {THEMES.map((theme) => (
          <Swatch
            key={theme.id}
            role="radio"
            aria-checked={currentTheme === theme.id}
            style={{ background: theme.bg, color: theme.fg }}
            onClick={() => setCurrentTheme(theme.id)}
          >
            {theme.label}
          </Swatch>
        ))}
      </Options>

      <PanelLabel>Typeface</PanelLabel>
      <Options role="radiogroup" aria-label="Typeface">
        {FONTS.map((font) => (
          <Option
            key={font.id}
            role="radio"
            aria-checked={readerSettings.fontFamily === font.id}
            style={{ fontFamily: font.css }}
            onClick={() => readerSettings.setFontFamily(font.id)}
          >
            {font.label}
          </Option>
        ))}
      </Options>

      <PanelLabel>Size · {readerSettings.fontSize}px</PanelLabel>
      <Stepper>
        <button
          aria-label="Smaller text"
          onClick={() =>
            readerSettings.setFontSize(
              Math.max(MIN_SIZE, readerSettings.fontSize - 1)
            )
          }
        >
          <Minus size={14} />
        </button>
        <Track aria-hidden="true">
          <span
            style={{ width: `${Math.min(100, Math.max(0, sizePercent))}%` }}
          />
        </Track>
        <button
          aria-label="Larger text"
          onClick={() =>
            readerSettings.setFontSize(
              Math.min(MAX_SIZE, readerSettings.fontSize + 1)
            )
          }
        >
          <Plus size={14} />
        </button>
      </Stepper>

      <PanelLabel>Line width</PanelLabel>
      <Options role="radiogroup" aria-label="Line width">
        {WIDTHS.map((option) => (
          <Option
            key={option.label}
            role="radio"
            aria-checked={option === width}
            onClick={() => readerSettings.setMarginWidth(option.margin)}
          >
            {option.label}
          </Option>
        ))}
      </Options>

      <PanelLabel>Line spacing</PanelLabel>
      <Options role="radiogroup" aria-label="Line spacing">
        {SPACINGS.map((option) => (
          <Option
            key={option.label}
            role="radio"
            aria-checked={option === spacing}
            onClick={() => readerSettings.setLineHeight(option.value)}
          >
            {option.label}
          </Option>
        ))}
      </Options>

      <MoreLink onClick={props.onShowAllSettings}>
        All reading settings
      </MoreLink>
    </Stack>
  )
}
