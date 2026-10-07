import { SpanBox, VStack } from '../../elements/LayoutPrimitives'

type FallbackImageProps = {
  title: string
  width: string
  height: string
  fontSize: string
}

export const GridFallbackImage = (props: FallbackImageProps): JSX.Element => {
  return (
    <VStack
      distribution="end"
      alignment="start"
      css={{
        width: props.width,
        height: props.height,
        padding: '16px 18px',
        position: 'relative',
        overflow: 'hidden',
        color: '$thFallbackImageForeground',
        backgroundColor: '$thFallbackImageBackground',
      }}
    >
      <SpanBox
        aria-hidden="true"
        css={{
          position: 'absolute',
          right: '14px',
          top: '-18px',
          fontFamily: '$display',
          fontSize: '140px',
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '-0.06em',
          opacity: 0.12,
        }}
      >
        {props.title.substring(0, 1).toLocaleUpperCase()}
      </SpanBox>
      <SpanBox
        css={{
          width: '28px',
          height: '3px',
          borderRadius: '3px',
          bg: '#FF4F00',
        }}
      />
    </VStack>
  )
}

export const ListFallbackImage = (props: FallbackImageProps): JSX.Element => {
  return (
    <VStack
      distribution="center"
      alignment="center"
      css={{
        width: props.width,
        height: props.height,
        fontSize: '22px',
        fontWeight: 600,
        fontFamily: '$display',
        padding: '5px',
        borderRadius: '10px',
        color: '$thFallbackImageForeground',
        backgroundColor: '$thFallbackImageBackground',
      }}
    >
      <SpanBox
        css={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          wordBreak: 'break-word',
          display: '-webkit-box',
          '-webkit-line-clamp': '2',
          '-webkit-box-orient': 'vertical',
        }}
      >
        {props.title.substring(0, 1).toLocaleUpperCase()}
      </SpanBox>
    </VStack>
  )
}
