import { ReactNode } from 'react'
import { styled } from '../../tokens/stitches.config'

const Row = styled('div', {
  display: 'flex',
  alignItems: 'baseline',
  gap: '10px',
  minWidth: 0,
})

const Title = styled('h2', {
  margin: 0,
  fontFamily: '$display',
  fontSize: '$body',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: '$stInk',
  whiteSpace: 'nowrap',
})

const Meta = styled('span', {
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const Action = styled('div', {
  marginLeft: 'auto',
  flex: 'none',
  fontSize: '$caption',
  color: '$stMuted',
  a: {
    color: 'inherit',
    textDecoration: 'none',
  },
  'a:hover': { color: '$stInk' },
})

type SectionHeaderProps = {
  title: string
  meta?: string
  action?: ReactNode
}

export const SectionHeader = (props: SectionHeaderProps): JSX.Element => {
  return (
    <Row>
      <Title>{props.title}</Title>
      {props.meta && <Meta>{props.meta}</Meta>}
      {props.action && <Action>{props.action}</Action>}
    </Row>
  )
}

// The large title at the top of a view, with an optional mono summary line.
export const PageTitle = styled('h1', {
  margin: 0,
  fontFamily: '$display',
  fontSize: '$title',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: '$stInk',
})

export const PageMeta = styled('span', {
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  fontVariantNumeric: 'tabular-nums',
})
