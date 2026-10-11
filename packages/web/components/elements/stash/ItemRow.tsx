import { forwardRef, HTMLAttributes, ReactNode } from 'react'
import { styled } from '../../tokens/stitches.config'
import { CoverImage } from './CoverImage'
import { motion } from './motion'

const Actions = styled('div', {
  display: 'none',
  alignItems: 'center',
  gap: '2px',
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
        [`& ${Leading}`]: { height: '18px' },
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
          width: '112px',
          height: '74px',
          '@smDown': { width: '72px', height: '54px' },
        },
      },
    },
  ],
})

const Body = styled('div', {
  minWidth: 0,
  display: 'grid',
  gap: '2px',
})

const Title = styled('div', {
  fontFamily: '$inter',
  fontSize: '$small',
  fontWeight: 500,
  lineHeight: 1.35,
  letterSpacing: '-0.005em',
  color: '$stInk',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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
  // The item's picture, shown as a small thumbnail beside the text.
  image?: string
  subtitle?: ReactNode
  excerpt?: string
  meta?: ReactNode
  actions?: ReactNode
  selected?: boolean
  muted?: boolean
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
    ...rest
  } = allProps
  const props = {
    leading,
    title,
    morphId,
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
      role="link"
      tabIndex={0}
      selected={props.selected}
      muted={props.muted}
      tall={!!props.excerpt}
      withImage={!!props.image}
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
      {props.image && <Thumb src={props.image} />}
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
