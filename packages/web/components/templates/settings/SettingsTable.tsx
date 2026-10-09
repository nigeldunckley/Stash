import { Pencil, Trash } from '@phosphor-icons/react'
import { Button } from '../../elements/Button'
import { Dropdown, DropdownOption } from '../../elements/DropdownElements'
import { MoreOptionsIcon } from '../../elements/images/MoreOptionsIcon'
import { InfoLink } from '../../elements/InfoLink'
import { Box, HStack, SpanBox, VStack } from '../../elements/LayoutPrimitives'
import { StyledText } from '../../elements/StyledText'
import { styled, theme } from '../../tokens/stitches.config'
import { SettingsLayout } from '../SettingsLayout'

// Styles
export const Header = styled(Box, {
  color: '$utilityTextDefault',
  fontSize: 'x-large',
  margin: '20px',
})

type SettingsTableProps = {
  pageId: string
  pageInfoLink?: string | undefined
  headerTitle: string

  createTitle?: string
  createAction?: () => void

  children: React.ReactNode
}

type CreateButtonProps = {
  title: string
  action: () => void
}

type SettingsTableRowProps = {
  title: string | JSX.Element
  isLast: boolean

  onClick?: () => void

  sublineElement: JSX.Element
  titleElement?: JSX.Element
  extraElement?: JSX.Element

  deleteTitle?: string
  onDelete?: () => void

  dropdownItems?: JSX.Element

  editTitle?: string
  onEdit?: () => void
}

type MoreOptionsProps = {
  deleteTitle?: string
  onDelete?: () => void
  dropdownItems?: JSX.Element
  editTitle?: string
  onEdit?: () => void
}

const MoreOptions = (props: MoreOptionsProps) => (
  <Dropdown
    align={'end'}
    triggerElement={
      <Box
        css={{
          '&:hover': {
            cursor: 'pointer',
          },
        }}
      >
        <MoreOptionsIcon
          size={22}
          strokeColor={theme.colors.stMuted.toString()}
          orientation="horizontal"
        />
      </Box>
    }
  >
    {props.onEdit && props.editTitle && (
      <DropdownOption
        onSelect={() => {
          props.onEdit && props.onEdit()
        }}
      >
        <HStack alignment={'center'} distribution={'start'}>
          <Pencil size={18} color={theme.colors.stInk2.toString()} />
          <SpanBox
            css={{
              color: '$stInk',
              marginLeft: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              '&:hover': {
                border: 'none',
                backgroundColor: 'transparent',
              },
            }}
          >
            {props.editTitle}
          </SpanBox>
        </HStack>
      </DropdownOption>
    )}

    {props.onDelete && props.deleteTitle && (
      <DropdownOption
        onSelect={() => {
          props.onDelete && props.onDelete()
        }}
      >
        <HStack alignment={'center'} distribution={'start'}>
          <Trash size={18} color={theme.colors.stAccentText.toString()} />
          <SpanBox
            css={{
              color: '$stAccentText',
              marginLeft: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              '&:hover': {
                border: 'none',
                backgroundColor: 'transparent',
              },
            }}
          >
            {props.deleteTitle}
          </SpanBox>
        </HStack>
      </DropdownOption>
    )}
    {props.dropdownItems && props.dropdownItems}
  </Dropdown>
)

type EmptySettingsRowProps = {
  text: string
}

export const EmptySettingsRow = (props: EmptySettingsRowProps): JSX.Element => {
  return (
    <Box
      css={{
        bg: '$stSurface',
        display: 'flex',
        alignItems: 'center',
        padding: '28px 16px',
        border: '1px solid $stLine',
        borderTop: 'none',
        width: '100%',
        boxSizing: 'border-box',
        fontSize: '14px',
        color: '$stMuted',
        justifyContent: 'center',
      }}
    >
      {props.text}
    </Box>
  )
}

export const SettingsTableRow = (props: SettingsTableRowProps): JSX.Element => {
  return (
    <Box
      css={{
        bg: '$stSurface',
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        border: '1px solid $stLine',
        borderTop: 'none',
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: '$inter',
        color: '$stInk2',
        cursor: !!props.onClick ? 'pointer' : 'unset',
        '&:hover': {
          bg: props.onClick ? '$stSunken' : '$stSurface',
        },
        '@md': {
          paddingLeft: '0',
        },
      }}
      onClick={props.onClick}
    >
      <Box
        css={{
          display: 'flex',
          width: '100%',
          flexDirection: 'column',
          '@md': {
            paddingLeft: '16px',
            flexDirection: 'row',
          },
        }}
      >
        <HStack
          distribution="start"
          css={{
            display: 'flex',
            padding: '4px 4px 4px 0px',
            '@md': {
              width: '70%',
            },
          }}
        >
          <VStack>
            <SpanBox
              css={{
                m: '0px',
                fontSize: '15px',
                fontWeight: 500,
                color: '$stInk',
                letterSpacing: '-0.01em',
              }}
            >
              {props.title}
            </SpanBox>
            {props.sublineElement}
          </VStack>
          <SpanBox css={{ marginLeft: 'auto' }}>{props.titleElement}</SpanBox>
          <Box
            css={{
              marginLeft: 'auto',
              textAlign: 'right',
              display: 'flex',
              '@md': {
                display: 'none',
              },
            }}
          >
            <MoreOptions
              deleteTitle={props.deleteTitle}
              onDelete={props.onDelete}
              dropdownItems={props.dropdownItems}
              editTitle={props.editTitle}
              onEdit={props.onEdit}
            />
          </Box>
        </HStack>
        {props.extraElement}
      </Box>
      <HStack distribution="start" css={{ marginLeft: 'auto' }}>
        <Box
          css={{
            textAlign: 'right',
            display: 'none',
            '@md': {
              display: 'flex',
            },
          }}
        >
          <MoreOptions
            deleteTitle={props.deleteTitle}
            onDelete={props.onDelete}
            dropdownItems={props.dropdownItems}
            editTitle={props.editTitle}
            onEdit={props.onEdit}
          />
        </Box>
      </HStack>
    </Box>
  )
}

const CreateButton = (props: CreateButtonProps): JSX.Element => {
  return (
    <Button
      onClick={props.action}
      style="ctaDarkYellow"
      css={{
        display: 'flex',
        alignItems: 'center',
        marginLeft: 'auto',
      }}
    >
      <SpanBox>{props.title}</SpanBox>
    </Button>
  )
}

export const SettingsTable = (props: SettingsTableProps): JSX.Element => {
  return (
    <SettingsLayout>
      <VStack
        alignment="start"
        distribution="start"
        css={{ width: '100%', fontFamily: '$inter' }}
      >
        <HStack
          alignment="center"
          distribution="between"
          css={{ width: '100%', gap: '16px', mb: '20px' }}
        >
          <HStack alignment="center" css={{ gap: '8px' }}>
            <SpanBox
              as="h1"
              css={{
                m: 0,
                fontSize: '28px',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: '$stInk',
                '@mdDown': { fontSize: '24px' },
              }}
            >
              {props.headerTitle}
            </SpanBox>
            {props.pageInfoLink && (
              <InfoLink href={props.pageInfoLink}></InfoLink>
            )}
          </HStack>
          {props.createAction && props.createTitle && (
            <CreateButton
              action={props.createAction}
              title={props.createTitle}
            />
          )}
        </HStack>
        <Box
          css={{
            width: '100%',
            '& > *:first-child': {
              borderTop: '1px solid $stLine',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
            },
            '& > *:last-child': {
              borderBottomLeftRadius: '8px',
              borderBottomRightRadius: '8px',
            },
          }}
        >
          {props.children}
        </Box>
      </VStack>
    </SettingsLayout>
  )
}
