import { TypeCover, TypeCoverProps } from './TypeCover'
import { CSSProperties, forwardRef, HTMLAttributes, ReactNode } from 'react'
import { keyframes, styled } from '../../tokens/stitches.config'
import { CoverImage } from './CoverImage'
import { motion, reducedMotion as reducedMotionQuery } from './motion'
import { Ribbon } from './Ribbon'

const Actions = styled('div', {
  display: 'none',
  alignItems: 'center',
  gap: '2px',
  // Touch screens swipe or press and hold instead.
  '@media (hover: none) and (pointer: coarse)': {
    visibility: 'hidden',
    width: 0,
  },
})

const Trailing = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
})

const Meta = styled('span', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
})

const Leading = styled('div', {
  display: 'grid',
  placeItems: 'center',
  minWidth: '18px',
})

const Thumb = styled(CoverImage, {
  width: '72px',
  height: '48px',
  borderRadius: '$sm',
  '@smDown': { width: '56px', height: '42px' },
})

// A part-read item keeps its place: a ribbon hangs from the top of its
// picture, or from the row's top edge when there isn't one.
const ThumbWrap = styled('div', {
  position: 'relative',
  lineHeight: 0,
  '& > svg': { position: 'absolute', top: 0, right: '6px' },
})

const RowRibbon = styled('span', {
  position: 'absolute',
  top: 0,
  right: '14px',
  lineHeight: 0,
  pointerEvents: 'none',
})

const Root = styled('div', {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 12px',
  minHeight: '56px',
  boxSizing: 'border-box',
  background: '$stSurface',
  cursor: 'pointer',
  outline: 'none',
  transition: `background ${motion.fast}`,
  // Keyboard users reach the actions by tabbing into the row.
  [`&:focus-within ${Actions}`]: { display: 'flex' },
  [`&:focus-within ${Meta}`]: { display: 'none' },
  '@media (hover: hover)': {
    '&:hover': { background: '$stSunken' },
    [`&:hover ${Actions}`]: { display: 'flex' },
    [`&:hover ${Meta}`]: { display: 'none' },
  },
  '&:focus-visible': {
    boxShadow: 'inset 0 0 0 2px $colors$stAccent',
  },
  variants: {
    selected: {
      true: {
        background: '$stSunken',
        // The accent bar already marks the row, so skip the focus ring.
        '&:focus-visible': { boxShadow: 'none' },
        [`& ${Actions}`]: { display: 'flex' },
        [`& ${Meta}`]: { display: 'none' },
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: '8px',
          bottom: '8px',
          width: '2px',
          borderRadius: '2px',
          background: '$stAccent',
        },
      },
    },
    tall: {
      true: {
        alignItems: 'start',
        [`& ${Leading}`]: { height: '21px' },
      },
    },
    muted: {
      true: {
        '& .row-title': { color: '$stMuted', fontWeight: 400 },
      },
    },
    withImage: {
      true: {
        gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
        minHeight: '68px',
        // Phones keep the actions but drop the meta to make room.
        [`& ${Meta}`]: { '@smDown': { display: 'none' } },
      },
    },
  },
  compoundVariants: [
    {
      // Rows with an excerpt have room for a larger picture.
      tall: true,
      withImage: true,
      css: {
        [`& ${Thumb}`]: {
          width: '88px',
          height: '60px',
          marginTop: '2px',
          '@smDown': { width: '64px', height: '48px' },
        },
      },
    },
  ],
})

const Body = styled('div', {
  minWidth: 0,
  display: 'grid',
  gap: '3px',
})

// Titles are set in the reading face, up to two lines, like the Library.
const Title = styled('div', {
  fontFamily: '$serif',
  fontSize: '17px',
  fontWeight: 500,
  lineHeight: 1.25,
  letterSpacing: '-0.006em',
  color: '$stInk',
  textWrap: 'pretty',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  '@smDown': { fontSize: '16.5px' },
})

const Subtitle = styled('div', {
  fontFamily: '$inter',
  fontSize: '$caption',
  lineHeight: 1.35,
  color: '$stMuted',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const Excerpt = styled('div', {
  fontFamily: '$inter',
  fontSize: '$caption',
  lineHeight: 1.45,
  color: '$stMuted',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  marginTop: '2px',
})

type ItemRowProps = {
  leading: ReactNode
  title: string
  // Lets the title grow into the Reader's headline when the row opens.
  morphId?: string
  // A cover set from the words, shown when there is no picture.
  cover?: TypeCoverProps
  // The item's picture, shown as a small thumbnail beside the text.
  image?: string
  subtitle?: ReactNode
  excerpt?: string
  meta?: ReactNode
  actions?: ReactNode
  selected?: boolean
  muted?: boolean
  // Reading progress, 0–100. Part-read rows get a ribbon.
  progress?: number
  onOpen?: () => void
  onFocus?: () => void
  onMouseEnter?: () => void
}

// One item in a list: favicon or dot, title and source, a trailing area that
// shows meta (read time, progress) at rest and actions on hover or selection,
// and the item's picture at the end when it has one.
// Other attributes (a context menu's handlers, for one) go on the row itself.
type ItemRowAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  keyof ItemRowProps | 'onClick' | 'onKeyDown'
>

export const ItemRow = forwardRef<
  HTMLDivElement,
  ItemRowProps & ItemRowAttributes
>(function ItemRow(allProps, ref) {
  const {
    leading,
    title,
    morphId,
    cover,
    image,
    subtitle,
    excerpt,
    meta,
    actions,
    selected,
    muted,
    progress,
    onOpen,
    onFocus,
    onMouseEnter,
    ...rest
  } = allProps
  const partRead = progress !== undefined && progress >= 3 && progress <= 97
  const props = {
    leading,
    title,
    morphId,
    cover,
    image,
    subtitle,
    excerpt,
    meta,
    actions,
    selected,
    muted,
    onOpen,
    onFocus,
    onMouseEnter,
  }
  return (
    <Root
      {...rest}
      ref={ref}
      data-stash-row=""
      role="link"
      tabIndex={0}
      selected={props.selected}
      muted={props.muted}
      tall={!!props.excerpt}
      withImage={!!props.image || !!props.cover}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a')) {
          return
        }
        props.onOpen?.()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          props.onOpen?.()
        }
      }}
      onFocus={props.onFocus}
      onMouseEnter={props.onMouseEnter}
    >
      <Leading>{props.leading}</Leading>
      <Body>
        <Title className="row-title" data-morph-title={props.morphId}>
          {props.title}
        </Title>
        {props.subtitle && <Subtitle>{props.subtitle}</Subtitle>}
        {props.excerpt && <Excerpt>{props.excerpt}</Excerpt>}
      </Body>
      <Trailing>
        {props.meta && <Meta>{props.meta}</Meta>}
        {props.actions && <Actions>{props.actions}</Actions>}
      </Trailing>
      {props.image || props.cover ? (
        <ThumbWrap>
          <Thumb
            src={props.image ?? undefined}
            fallback={props.cover && <TypeCover {...props.cover} small />}
          />
          {partRead && <Ribbon width={8} height={18} />}
        </ThumbWrap>
      ) : (
        partRead && (
          <RowRibbon>
            <Ribbon width={7} height={15} />
          </RowRibbon>
        )
      )}
    </Root>
  )
})

// The bordered container that holds a run of ItemRows.
export const ItemList = styled('div', {
  border: '1px solid $stLine',
  borderRadius: '$md',
  background: '$stSurface',
  overflow: 'hidden',
  // Rows may be wrapped (for example in SwipeAction), so divide the children.
  '& > * + *': { borderTop: '1px solid $stLine' },
})

// The Wire: the same row set as a newsroom wire. Time to the minute, the
// source in mono, the headline on one line and its length, so forty items
// fit on a screen. A row that has just arrived types its headline in
// behind an orange cursor and stays warm for a minute.

const typeIn = keyframes({
  from: { clipPath: 'inset(0 100% 0 0)' },
  to: { clipPath: 'inset(0 0 0 0)' },
})

const caret = keyframes({
  '0%, 49%': { opacity: 1 },
  '50%, 100%': { opacity: 0 },
})

const warm = keyframes({
  from: {
    background:
      'color-mix(in srgb, var(--colors-stAccent) 9%, var(--colors-stSurface))',
  },
  to: { background: '$stSurface' },
})

const WireRoot = styled(Root, {
  gridTemplateColumns: '18px 44px 150px minmax(0, 1fr) auto',
  gap: '14px',
  minHeight: '40px',
  padding: '7px 12px',
  alignItems: 'baseline',
  [`& ${Leading}`]: { alignSelf: 'center' },
  '@smDown': {
    gridTemplateColumns: '18px auto minmax(0, 1fr) auto',
    gridTemplateAreas: '"dot time source trail" "dot title title title"',
    rowGap: '2px',
    columnGap: '8px',
    padding: '9px 12px',
  },
  '&[data-fresh]': {
    animation: `${warm} 60s linear both`,
    '& .row-title > span': {
      animation: `${typeIn} var(--type-for) steps(var(--chars)) both`,
    },
    '& .row-title::after': {
      content: '""',
      display: 'inline-block',
      width: '0.5em',
      height: '1em',
      marginLeft: '1px',
      verticalAlign: '-0.12em',
      background: '$stAccent',
      animation: `${caret} 0.9s steps(1) var(--type-for) 3 both`,
    },
    [reducedMotionQuery]: {
      animation: 'none',
      '& .row-title > span': { animation: 'none' },
      '& .row-title::after': { display: 'none' },
    },
  },
})

const WireTime = styled('time', {
  fontFamily: '$mono',
  fontSize: '12px',
  color: '$stMuted',
  fontVariantNumeric: 'tabular-nums',
  '@smDown': { gridArea: 'time', fontSize: '11px' },
  '[data-fresh] &': { color: '$stAccentText' },
})

const WireSource = styled('span', {
  fontFamily: '$mono',
  fontSize: '11px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  '@smDown': { gridArea: 'source', fontSize: '10px' },
  '[data-fresh] &': { color: '$stAccentText' },
})

const WireTitle = styled('div', {
  fontFamily: '$serif',
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: 1.3,
  color: '$stInk',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  '& > span': { display: 'inline' },
  '@smDown': { gridArea: 'title', whiteSpace: 'normal', fontSize: '15.5px' },
})

const WireTrail = styled(Trailing, {
  '@smDown': { gridArea: 'trail' },
})

type WireRowProps = {
  leading: ReactNode
  title: string
  morphId?: string
  time: string
  dateTime?: string
  source?: string
  length?: string
  // Arrived since the wire was opened: types itself in.
  fresh?: boolean
  actions?: ReactNode
  selected?: boolean
  muted?: boolean
  onOpen?: () => void
  onFocus?: () => void
}

export const WireRow = forwardRef<
  HTMLDivElement,
  WireRowProps &
    Omit<
      HTMLAttributes<HTMLDivElement>,
      keyof WireRowProps | 'onClick' | 'onKeyDown'
    >
>(function WireRow(allProps, ref) {
  const {
    leading,
    title,
    morphId,
    time,
    dateTime,
    source,
    length,
    fresh,
    actions,
    selected,
    muted,
    onOpen,
    onFocus,
    ...rest
  } = allProps
  const chars = Math.min(80, title.length)
  return (
    <WireRoot
      {...rest}
      ref={ref}
      data-stash-row=""
      data-fresh={fresh ? '' : undefined}
      role="link"
      tabIndex={0}
      selected={selected}
      muted={muted}
      style={
        fresh
          ? ({
              '--chars': chars,
              '--type-for': `${Math.min(1400, chars * 22)}ms`,
            } as CSSProperties)
          : undefined
      }
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a')) {
          return
        }
        onOpen?.()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) {
          onOpen?.()
        }
      }}
      onFocus={onFocus}
    >
      <Leading>{leading}</Leading>
      <WireTime dateTime={dateTime}>{time}</WireTime>
      <WireSource>{source}</WireSource>
      <WireTitle className="row-title" data-morph-title={morphId}>
        <span>{title}</span>
      </WireTitle>
      <WireTrail>
        {length && <Meta>{length}</Meta>}
        {actions && <Actions>{actions}</Actions>}
      </WireTrail>
    </WireRoot>
  )
})

// An hour mark between runs of wire rows.
export const WireHour = styled('div', {
  padding: '14px 12px 5px 44px',
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '$stMuted',
  background: '$stSurface',
  borderBottom: '1px solid $stInk',
})
