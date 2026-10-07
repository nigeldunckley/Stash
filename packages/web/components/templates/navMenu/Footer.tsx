import { HStack, SpanBox } from '../../elements/LayoutPrimitives'
import { SplitButton } from '../../elements/SplitButton'
import { PrimaryDropdown } from '../PrimaryDropdown'

type NavMenuFooterProps = {
  showFullThemeSection?: boolean
  setShowAddLinkModal?: (show: true) => void
}

export const NavMenuFooter = (props: NavMenuFooterProps): JSX.Element => {
  return (
    <HStack
      css={{
        gap: '10px',
        height: '65px',
        position: 'sticky',
        bottom: '0px',
        mt: 'auto',
        alignItems: 'center',
        bg: '$thLeftMenuBackground',
        borderTop: '1px solid $thBorderSubtle',
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        '&::-webkit-scrollbar': {
          display: 'none',
        },
      }}
    >
      <PrimaryDropdown />
      <SpanBox
        css={{
          marginLeft: 'auto',
          marginRight: '15px',
        }}
      >
        {props.setShowAddLinkModal && (
          <SplitButton
            title="Add"
            setShowLinkMode={() => {
              props.setShowAddLinkModal && props.setShowAddLinkModal(true)
            }}
          />
        )}
      </SpanBox>
    </HStack>
  )
}
