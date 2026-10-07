import { HStack, VStack } from './LayoutPrimitives'
import { Button } from './Button'
import { CaretDownIcon } from './icons/CaretDownIcon'

type ShowLinkMode = 'none' | 'link' | 'pdf'

type SplitButtonProps = {
  title: string
  setShowLinkMode: (mode: ShowLinkMode) => void
}

const CaretButton = (): JSX.Element => {
  return (
    <VStack
      css={{
        width: '20px',
        height: '100%',
        alignItems: 'center',
        bg: '$ctaBlue',
        border: '0px solid transparent',
        borderTopRightRadius: '5px',
        borderBottomRightRadius: '5px',
        borderTopLeftRadius: '0px',
        borderBottomLeftRadius: '0px',
        '--caret-color': '#EDEDED',
        '&:hover': {
          opacity: 1.0,
          color: 'white',
          '--caret-color': 'white',
        },
        '&:focus': {
          outline: 'none',
          border: '0px solid transparent',
        },
      }}
    >
      <CaretDownIcon size={8} color="var(--caret-color)" />
    </VStack>
  )
}

export const SplitButton = (props: SplitButtonProps): JSX.Element => {
  return (
    <HStack css={{ height: '32px', gap: '1px' }}>
      <Button
        css={{
          display: 'flex',
          bg: '$thTextContrast',
          color: '$thBackground',
          fontWeight: 500,
          fontSize: '14px',
          fontFamily: '$inter',
          border: '0px solid transparent',
          borderTopLeftRadius: '8px',
          borderBottomLeftRadius: '8px',
          borderTopRightRadius: '8px',
          borderBottomRightRadius: '8px',
          '&:hover': {
            opacity: 0.85,
            border: '0px solid transparent',
          },
          '&:focus': {
            outline: 'none',
            border: '0px solid transparent',
          },
        }}
        onClick={(event) => {
          props.setShowLinkMode('link')
          event.preventDefault()
        }}
      >
        {props.title}
      </Button>
      {/* <Dropdown triggerElement={<CaretButton />}>
        <DropdownOption onSelect={() => console.log()} title="Archive (e)" />
      </Dropdown> */}
    </HStack>
  )
}
