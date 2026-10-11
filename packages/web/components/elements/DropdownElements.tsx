import {
  Separator,
  Item,
  Content,
  Root,
  Trigger,
  Arrow,
  Label,
  Portal,
} from '@radix-ui/react-dropdown-menu'
import { PopperContentProps } from '@radix-ui/react-popover'
import { CSS } from '@stitches/react'
import { styled } from './../tokens/stitches.config'
import {
  menuContentStyles,
  menuItemStyles,
  menuSeparatorStyles,
} from './stash/Menu'

const StyledItem = styled(Item, {
  ...menuItemStyles,
  variants: {
    destructive: { true: { color: '$stDanger' } },
  },
})

const DropdownTrigger = styled(Trigger, {
  fontSize: '100%',
  border: 0,
  padding: 0,
  backgroundColor: 'transparent',
  '&:hover': {
    opacity: 1.0,
  },
  '&:focus': {
    outline: 'none',
  },
})

const StyledTriggerItem = styled(Trigger, {
  '&[data-state="open"]': {
    outline: 'none',
    backgroundColor: '$grayBgHover',
  },
})

export const DropdownContent = styled(Content, {
  ...menuContentStyles,
  transformOrigin: 'var(--radix-dropdown-menu-content-transform-origin)',
})

const StyledArrow = styled(Arrow, {
  visibility: 'hidden',
})

const StyledLabel = styled(Label, {
  color: '$stMuted',
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  padding: '6px 10px 4px',
  cursor: 'default',
})

export type DropdownAlignment = 'start' | 'end' | 'center'
export type DropdownSide = 'top' | 'right' | 'bottom' | 'left'

type DropdownProps = {
  labelText?: string
  triggerElement: React.ReactNode
  children: React.ReactNode
  styledArrow?: boolean
  align?: DropdownAlignment
  side?: DropdownSide
  sideOffset?: number
  disabled?: boolean
  css?: CSS
  modal?: boolean
  onOpenChange?: (open: boolean) => void
}

export const DropdownSeparator = styled(Separator, menuSeparatorStyles)

type DropdownOptionProps = {
  onSelect: () => void
  title?: string
  children?: React.ReactNode
  hideSeparator?: boolean
  destructive?: boolean
}

export function DropdownOption(props: DropdownOptionProps): JSX.Element {
  return (
    <>
      <StyledItem
        destructive={props.destructive}
        onSelect={() => {
          props.onSelect()
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {props.title ?? props.children}
      </StyledItem>
    </>
  )
}

export function Dropdown(
  props: DropdownProps & PopperContentProps
): JSX.Element {
  const {
    children,
    align,
    triggerElement,
    labelText,
    disabled = false,
    side = 'bottom',
    sideOffset = 0,
    alignOffset = 0,
    css,
    modal,
    onOpenChange,
  } = props
  return (
    <Root modal={modal} onOpenChange={props.onOpenChange}>
      <DropdownTrigger
        disabled={disabled}
        css={{
          height: '100%',
          cursor: 'pointer',
          '&:hover': { opacity: '1.0' },
        }}
      >
        {triggerElement}
      </DropdownTrigger>
      <Portal>
        <DropdownContent
          css={css}
          onInteractOutside={() => {
            // remove focus from dropdown
            ;(document.activeElement as HTMLElement).blur()
          }}
          side={side}
          sideOffset={sideOffset || 6}
          collisionPadding={12}
          align={align ? align : 'center'}
          alignOffset={alignOffset}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
          }}
        >
          {labelText && <StyledLabel>{labelText}</StyledLabel>}
          {children}
          <StyledArrow />
        </DropdownContent>
      </Portal>
    </Root>
  )
}

export function NestedDropdown(props: DropdownProps): JSX.Element {
  return (
    <Root>
      <StyledTriggerItem>{props.triggerElement}</StyledTriggerItem>
      <DropdownContent
        sideOffset={12}
        onInteractOutside={() => {
          // remove focus from sub-dropdown
          ;(document.activeElement as HTMLElement).blur()
        }}
      >
        {props.children}
        <StyledArrow offset={13} />
      </DropdownContent>
    </Root>
  )
}
