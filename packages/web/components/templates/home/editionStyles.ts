import { CoverImage } from '../../elements/stash'
import { motion, pressable, reducedMotion } from '../../elements/stash/motion'
import { keyframes, styled } from '../../tokens/stitches.config'

// The look of The Edition, shared with The Discovery Edition on Saturdays.

export const Page = styled('main', {
  width: '100%',
  minHeight: '100vh',
  boxSizing: 'border-box',
  color: '$stInk',
  fontFamily: '$inter',
  padding: '28px 40px 80px',
  '@lgDown': { padding: '24px 28px 64px' },
  '@mdDown': { padding: '12px 16px 40px' },
})

export const Column = styled('div', {
  maxWidth: '1080px',
  margin: '0 auto',
  display: 'grid',
  gap: '32px',
  '@mdDown': { gap: '26px' },
})

export const Mast = styled('header', { display: 'grid', gap: '12px' })

export const MastTop = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: '16px',
  paddingBottom: '10px',
  borderBottom: '2px solid $stInk',
})

export const MastTitle = styled('h1', {
  margin: 0,
  fontFamily: '$display',
  fontSize: '44px',
  fontWeight: 700,
  letterSpacing: '-0.045em',
  lineHeight: 1,
  whiteSpace: 'nowrap',
  em: { fontStyle: 'normal', color: '$stAccent' },
  '@mdDown': { fontSize: '34px' },
})

export const MastDate = styled('div', {
  display: 'flex',
  alignItems: 'flex-end',
  gap: '10px',
  fontFamily: '$mono',
  fontSize: '$caption',
  lineHeight: 1.6,
  color: '$stInk2',
  textAlign: 'right',
  textTransform: 'uppercase',
  fontVariantNumeric: 'tabular-nums',
  '@mdDown': { fontSize: '10.5px' },
})

export const LongDate = styled('span', { '@mdDown': { display: 'none' } })
export const ShortDate = styled('span', {
  display: 'none',
  '@mdDown': { display: 'inline' },
})

export const Arrows = styled('span', {
  display: 'inline-flex',
  gap: '2px',
  button: {
    all: 'unset',
    display: 'grid',
    placeItems: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '$sm',
    color: '$stMuted',
    cursor: 'pointer',
    '&:hover:not(:disabled)': { color: '$stInk', background: '$stSunken' },
    '&:disabled': { opacity: 0.3, cursor: 'default' },
    '&:focus-visible': { outline: '2px solid $stAccent' },
  },
})

export const MastSub = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  fontSize: '$small',
  color: '$stMuted',
  '@mdDown': { flexDirection: 'column', alignItems: 'flex-start', gap: '8px' },
})

export const TimeRow = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '6px 14px',
  marginTop: '12px',
  fontSize: '$small',
  color: '$stMuted',
})

export const Chips = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '6px',
  '& > span': { marginRight: '4px' },
})

export const Chip = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  height: '28px',
  padding: '0 11px',
  display: 'inline-flex',
  alignItems: 'center',
  fontFamily: '$mono',
  fontSize: '12px',
  borderRadius: '999px',
  border: '1px solid $stLine',
  color: '$stInk2',
  background: '$stSurface',
  cursor: 'pointer',
  transition: `background ${motion.fast}, color ${motion.fast}, border-color ${motion.fast}`,
  '&:hover': { borderColor: '$stLineStrong' },
  '&[aria-pressed="true"]': {
    background: '$stInk',
    color: '$stSurface',
    borderColor: '$stInk',
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

export const Fit = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  fontFamily: '$mono',
  fontSize: '$micro',
  '& > i': {
    display: 'block',
    width: '120px',
    height: '4px',
    borderRadius: '2px',
    background: '$stLine',
    overflow: 'hidden',
  },
  '& > i > b': {
    display: 'block',
    height: '100%',
    background: '$stAccent',
    transition: `width ${motion.base}`,
  },
})

export const fill = keyframes({
  from: { transform: 'scaleX(0.2)', opacity: 0.4 },
  to: { transform: 'none', opacity: 1 },
})

export const Ticks = styled('span', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flex: 'none',
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  fontVariantNumeric: 'tabular-nums',
  '& > span': { display: 'inline-flex', gap: '3px' },
  i: {
    width: '14px',
    height: '4px',
    borderRadius: '1px',
    background: '$stLineStrong',
  },
  'i[data-done="true"]': {
    background: '$stAccent',
    animation: `${fill} 500ms ease-out both`,
    [reducedMotion]: { animation: 'none' },
  },
})

export const CaptureForm = styled('form', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '0 12px',
  height: '38px',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$sm',
  color: '$stMuted',
  transition: `border-color ${motion.fast}, box-shadow ${motion.fast}`,
  '&:focus-within': {
    borderColor: '$stLineStrong',
    boxShadow: '0 0 0 3px $colors$stAccentTint',
  },
  input: {
    all: 'unset',
    flex: 1,
    minWidth: 0,
    fontFamily: '$inter',
    fontSize: '$body',
    color: '$stInk',
    '&::placeholder': { color: '$stMuted' },
  },
  '@mdDown': { kbd: { display: 'none' } },
  // On iPhone the field folds into the masthead's + button and opens
  // only when asked for.
  '@smDown': {
    height: '44px',
    '&:not([data-open="true"])': { display: 'none' },
  },
})

export const AddButton = styled('button', {
  all: 'unset',
  display: 'none',
  placeItems: 'center',
  flex: 'none',
  alignSelf: 'center',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  border: '1px solid $stLine',
  background: '$stSurface',
  color: '$stInk',
  cursor: 'pointer',
  ...pressable,
  '&[aria-expanded="true"]': {
    background: '$stInk',
    borderColor: '$stInk',
    color: '$stCanvas',
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '@smDown': { display: 'grid' },
})

export const Source = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '$stMuted',
  '& > span:not(:first-child)': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  b: { fontWeight: 500, color: '$stAccentText', flex: 'none' },
})

export const Meta = styled('div', {
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  textTransform: 'uppercase',
  fontVariantNumeric: 'tabular-nums',
})

export const selectable = {
  borderRadius: '$sm',
  outline: '2px solid transparent',
  outlineOffset: '6px',
  transition: `outline-color ${motion.fast}, opacity ${motion.base}`,
  '&[data-selected="true"]': { outlineColor: '$stAccentTint' },
  '&[data-done="true"]': { opacity: 0.55 },
  '&[data-done="true"]:hover': { opacity: 1 },
}

export const Lead = styled('article', {
  ...selectable,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)',
  gap: '28px',
  alignItems: 'center',
  '@mdDown': { gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px' },
})

export const LeadCover = styled(CoverImage, {
  aspectRatio: '4 / 3',
  borderRadius: '$sm',
  cursor: 'pointer',
  '@mdDown': {
    aspectRatio: '3 / 2',
    // Leave the headline above the fold on a phone.
    maxHeight: '40svh',
    margin: '0 -16px',
    borderRadius: 0,
    '&::after': { display: 'none' },
  },
})

export const Fallback = styled('span', {
  display: 'grid',
  placeItems: 'center',
  width: '100%',
  height: '100%',
})

export const LeadCopy = styled('div', {
  display: 'grid',
  gap: '12px',
  minWidth: 0,
})

export const headline = {
  all: 'unset',
  cursor: 'pointer',
  fontFamily: '$serif',
  fontWeight: 500,
  color: '$stInk',
  textWrap: 'balance',
  '@media (hover: hover)': {
    '&:hover': { textDecoration: 'underline', textDecorationThickness: '1px' },
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
}

export const LeadTitle = styled('button', {
  ...headline,
  fontSize: '38px',
  lineHeight: 1.08,
  letterSpacing: '-0.015em',
  '@lgDown': { fontSize: '32px' },
  '@mdDown': { fontSize: '28px', lineHeight: 1.1 },
})

export const Dek = styled('p', {
  margin: 0,
  fontFamily: '$serif',
  fontSize: '18px',
  lineHeight: 1.45,
  color: '$stInk2',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  '@mdDown': { fontSize: '16px' },
})

export const Actions = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginTop: '4px',
  // Full-width, thumb-sized buttons on a phone.
  '@smDown': {
    display: 'grid',
    gridAutoFlow: 'column',
    gridAutoColumns: '1fr',
    '& > button': { height: '44px', justifyContent: 'center' },
  },
})

export const Btn = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '32px',
  padding: '0 12px',
  border: '1px solid $stLineStrong',
  borderRadius: '$sm',
  background: '$stSurface',
  fontSize: '$small',
  fontWeight: 500,
  color: '$stInk',
  cursor: 'pointer',
  transition: `background ${motion.fast}, border-color ${motion.fast}, transform ${motion.fast}`,
  ...pressable,
  '@media (hover: hover)': { '&:hover': { borderColor: '$stMuted' } },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  kbd: { '@mdDown': { display: 'none' } },
  variants: {
    primary: {
      true: {
        background: '$stInk',
        borderColor: '$stInk',
        color: '$stCanvas',
        '@media (hover: hover)': {
          '&:hover': { borderColor: '$stInk', opacity: 0.9 },
        },
        kbd: {
          background: 'transparent',
          color: 'inherit',
          borderColor: 'currentColor',
          opacity: 0.6,
        },
      },
    },
  },
})

export const SectionHead = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '12px',
  borderTop: '1px solid $stInk',
  paddingTop: '8px',
  marginBottom: '14px',
  h2: {
    margin: 0,
    fontSize: '$caption',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  span: { fontFamily: '$mono', fontSize: '$micro', color: '$stMuted' },
})

export const Picks = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '24px',
  '@mdDown': {
    display: 'flex',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    scrollPaddingInline: '16px',
    margin: '0 -16px',
    padding: '0 16px 4px',
    gap: '14px',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
    '& > *': { flex: '0 0 78%', scrollSnapAlign: 'start' },
  },
})

export const Story = styled('article', {
  ...selectable,
  display: 'grid',
  gap: '8px',
  alignContent: 'start',
  minWidth: 0,
})

export const StoryCover = styled(CoverImage, {
  aspectRatio: '16 / 10',
  borderRadius: '$sm',
  cursor: 'pointer',
})

export const StoryTitle = styled('button', {
  ...headline,
  fontSize: '21px',
  lineHeight: 1.18,
  letterSpacing: '-0.01em',
  '@mdDown': { fontSize: '19px' },
})

export const StoryDek = styled('p', {
  margin: 0,
  fontFamily: '$serif',
  fontSize: '15px',
  lineHeight: 1.45,
  color: '$stInk2',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

export const StoryFoot = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
})

export const Quiet = styled('span', {
  display: 'inline-flex',
  gap: '2px',
  button: {
    all: 'unset',
    display: 'grid',
    placeItems: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '$sm',
    color: '$stMuted',
    cursor: 'pointer',
    '&:hover': { color: '$stInk', background: '$stSunken' },
    '&:focus-visible': { outline: '2px solid $stAccent' },
  },
})

export const Lower = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
  gap: '40px',
  alignItems: 'start',
  '@mdDown': { gridTemplateColumns: 'minmax(0, 1fr)', gap: '26px' },
})

export const Stack = styled('div', {
  display: 'grid',
  gap: '28px',
  minWidth: 0,
})

export const Brief = styled('ul', { listStyle: 'none', margin: 0, padding: 0 })

export const BriefRow = styled('li', {
  ...selectable,
  outlineOffset: '2px',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '12px',
  alignItems: 'center',
  padding: '11px 0',
  borderBottom: '1px solid $stLine',
})

export const BriefTitle = styled('button', {
  ...headline,
  display: 'block',
  marginTop: '3px',
  fontSize: '17px',
  lineHeight: 1.3,
})

export const BriefEnd = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
})

export const Resume = styled('a', {
  display: 'grid',
  gridTemplateColumns: '56px minmax(0, 1fr)',
  gap: '12px',
  alignItems: 'center',
  color: 'inherit',
  textDecoration: 'none',
  '& + &': { marginTop: '12px' },
  '&:hover strong': { textDecoration: 'underline' },
  strong: {
    display: 'block',
    fontFamily: '$serif',
    fontSize: '16px',
    fontWeight: 500,
    lineHeight: 1.25,
  },
})

export const Thumb = styled(CoverImage, {
  aspectRatio: '1',
  borderRadius: '$sm',
})

export const ResumeMeta = styled(Meta, {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '8px',
  marginTop: '4px',
})

export const Videos = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '14px',
})

export const Video = styled('button', {
  all: 'unset',
  display: 'grid',
  gap: '6px',
  minWidth: 0,
  cursor: 'pointer',
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '& > span:first-child': { aspectRatio: '16 / 9', borderRadius: '$sm' },
  strong: { fontSize: '$small', fontWeight: 500, lineHeight: 1.3 },
  '&:hover strong': { textDecoration: 'underline' },
})

export const Colophon = styled('footer', {
  borderTop: '2px solid $stInk',
  paddingTop: '14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px 16px',
  flexWrap: 'wrap',
  '& p': {
    margin: 0,
    fontFamily: '$serif',
    fontStyle: 'italic',
    fontSize: '17px',
    color: '$stInk2',
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '$small',
    color: '$stMuted',
  },
  select: {
    font: 'inherit',
    fontFamily: '$mono',
    color: '$stInk',
    background: '$stSurface',
    border: '1px solid $stLineStrong',
    borderRadius: '$sm',
    padding: '4px 6px',
  },
})

export const Notice = styled('div', {
  padding: '36px 16px',
  textAlign: 'center',
  fontSize: '$body',
  color: '$stMuted',
  border: '1px dashed $stLine',
  borderRadius: '$md',
  display: 'grid',
  gap: '12px',
  justifyItems: 'center',
})

export const pulse = keyframes({ '50%': { opacity: 0.45 } })

export const Making = styled('div', {
  display: 'grid',
  gap: '14px',
  '& > i': {
    display: 'block',
    height: '14px',
    borderRadius: '$sm',
    background: '$stSunken',
    animation: `${pulse} 1.4s ease-in-out infinite`,
    [reducedMotion]: { animation: 'none' },
  },
})
