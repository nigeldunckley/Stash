import { HStack, SpanBox, VStack } from './LayoutPrimitives'
import { theme } from '../tokens/stitches.config'
import { Button } from './Button'
import { CloseIcon } from './icons/CloseIcon'
import { ArrowSquareOut } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'

type FeatureHelpBoxProps = {
  helpTitle: string
  helpMessage: string

  helpCTAText?: string
  onClickCTA?: () => void

  docsMessage: string
  docsDestination: string

  onDismiss: () => void
}

export const FeatureHelpBox = (props: FeatureHelpBoxProps) => {
  const [display, setDisplay] = useState(false)

  useEffect(() => {
    setDisplay(true)
  }, [])

  if (!display) {
    return <></>
  }

  return (
    <VStack
      css={{
        gap: '12px',
        my: '24px',
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid $stLine',
        borderLeft: '2px solid $stAccent',
        borderRadius: '8px',
        bg: '$stSunken',
        fontFamily: '$inter',
        fontSize: '14px',
        lineHeight: 1.5,
        color: '$stInk2',
        p: '16px 18px',
      }}
      alignment="start"
      distribution="start"
    >
      <HStack css={{ width: '100%', gap: '16px' }} distribution="between">
        <SpanBox
          css={{
            fontSize: '15px',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: '$stInk',
          }}
        >
          {props.helpTitle}
        </SpanBox>
        <Button
          style="plainIcon"
          title="Hide this tip"
          onClick={(event) => {
            props.onDismiss()
            event.preventDefault()
          }}
        >
          <CloseIcon size={20} color={theme.colors.stMuted.toString()} />
        </Button>
      </HStack>
      <SpanBox>{props.helpMessage}</SpanBox>
      <HStack css={{ gap: '8px' }}>
        {props.helpCTAText && props.onClickCTA && (
          <Button
            style="ctaDarkYellow"
            onClick={(event) => {
              if (props.onClickCTA) {
                props.onClickCTA()
                event.preventDefault()
              }
            }}
            css={{ '@smDown': { display: 'none' } }}
          >
            {props.helpCTAText}
          </Button>
        )}
        <Button
          style="ctaOutlineYellow"
          onClick={(event) => {
            window.open(props.docsDestination, '_blank', 'noreferrer')
            event.preventDefault()
          }}
          css={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {props.docsMessage}
          <ArrowSquareOut size={12} />
        </Button>
      </HStack>
    </VStack>
  )
}
