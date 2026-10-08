import { forwardRef, ReactNode } from 'react'
import { styled } from '../../tokens/stitches.config'
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
  borderTop: '1px solid $stLine',
  cursor: 'pointer',
  outline: 'none',
  transition: `background ${motion.fast}`,
  '&:first-child': { borderTop: 'none' },
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
  },
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

// One item in a list: favicon or dot, title and source, and a trailing area that
// shows meta (read time, progress) at rest and actions on hover or selection.
export const ItemRow = forwardRef<HTMLDivElement, ItemRowProps>(
  function ItemRow(props, ref) {
    return (
      <Root
        ref={ref}
        role="link"
        tabIndex={0}
        selected={props.selected}
        muted={props.muted}
        tall={!!props.excerpt}
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
          <Title className="row-title">{props.title}</Title>
          {props.subtitle && <Subtitle>{props.subtitle}</Subtitle>}
          {props.excerpt && <Excerpt>{props.excerpt}</Excerpt>}
        </Body>
        <Trailing>
          {props.meta && <Meta>{props.meta}</Meta>}
          {props.actions && <Actions>{props.actions}</Actions>}
        </Trailing>
      </Root>
    )
  }
)

// The bordered container that holds a run of ItemRows.
export const ItemList = styled('div', {
  border: '1px solid $stLine',
  borderRadius: '$md',
  background: '$stSurface',
  overflow: 'hidden',
})
