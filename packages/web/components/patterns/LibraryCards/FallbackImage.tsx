import { SpanBox, VStack } from '../../elements/LayoutPrimitives'

type FallbackImageProps = {
  title: string
  source?: string
  width: string
  height: string
  fontSize: string
}

// Shown in place of a cover image. A plain panel with the source name (or the
// title when there is no source), so cards without artwork stay quiet instead
// of filling with a giant letter.
export const GridFallbackImage = (props: FallbackImageProps): JSX.Element => {
  return (
    <VStack
      distribution="end"
      alignment="start"
      css={{
        width: props.width,
        height: props.height,
        padding: '12px 14px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        backgroundColor: '$stSunken',
        borderBottom: '1px solid $stLine',
      }}
    >
      {(props.source || props.title) && (
        <SpanBox
          css={{
            maxWidth: '100%',
            fontFamily: '$mono',
            fontSize: '$micro',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '$stMuted',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {props.source || props.title}
        </SpanBox>
      )}
    </VStack>
  )
}

export const ListFallbackImage = (props: FallbackImageProps): JSX.Element => {
  return (
    <VStack
      distribution="center"
      alignment="center"
      aria-hidden="true"
      css={{
        width: props.width,
        height: props.height,
        boxSizing: 'border-box',
        fontFamily: '$mono',
        fontSize: '18px',
        fontWeight: 500,
        borderRadius: '$md',
        color: '$stMuted',
        backgroundColor: '$stSunken',
        border: '1px solid $stLine',
      }}
    >
      {(props.source || props.title).substring(0, 1).toLocaleUpperCase()}
    </VStack>
  )
}
