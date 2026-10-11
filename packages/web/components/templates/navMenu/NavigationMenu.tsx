import { ReactNode, useCallback, useRef, useState } from 'react'
import { StyledText } from '../../elements/StyledText'
import { Box, HStack, SpanBox, VStack } from '../../elements/LayoutPrimitives'
import { Button } from '../../elements/Button'
import {
  Archive,
  Books,
  Compass,
  DotsThree,
  Highlighter,
  House,
  Plus,
  Rss,
  Trash,
} from '@phosphor-icons/react'
import { IconButton } from '../../elements/stash'
import { useGetLibraryItems } from '../../../lib/networking/library_items/useLibraryItems'
import { useGetShortcuts } from '../../../lib/networking/shortcuts/useShortcuts'
import { theme } from '../../tokens/stitches.config'
import { usePersistedState } from '../../../lib/hooks/usePersistedState'
import { NavMenuFooter } from './Footer'
import { ServerVersionChip } from '../settings/ServerVersionChip'
import { StashMark } from '../../elements/images/OmnivoreNameLogo'
import { Dropdown, DropdownOption } from '../../elements/DropdownElements'
import { useRouter } from 'next/router'
import { NavigationSection } from '../NavigationLayout'
import { TreeApi } from 'react-arborist'
import React from 'react'
import { NavMoreButtonDownIcon } from '../../elements/icons/NavMoreButtonDown'
import { NavMoreButtonUpIcon } from '../../elements/icons/NavMoreButtonUp'
import {
  Shortcut,
  useResetShortcuts,
} from '../../../lib/networking/shortcuts/useShortcuts'
import { ShortcutsTree } from '../ShortcutsTree'

export const LIBRARY_LEFT_MENU_WIDTH = '275px'

type NavigationMenuProps = {
  section: NavigationSection

  setShowAddLinkModal: (show: boolean) => void

  showMenu: boolean
  setShowMenu: (show: boolean) => void
}

export function NavigationMenu(props: NavigationMenuProps): JSX.Element {
  const [dismissed, setDismissed] = useState(false)
  return (
    <>
      <Box
        css={{
          // Stash floats the menu as a panel inset from the window edges
          left: '12px',
          top: '12px',
          bottom: '12px',
          position: 'fixed',
          display: 'flex',
          flexDirection: 'column',
          '& > *': { flexShrink: 0 },
          width: `calc(${LIBRARY_LEFT_MENU_WIDTH} - 24px)`,
          bg: '$thLeftMenuBackground',
          border: '1px solid $thBorderColor',
          borderRadius: '14px',
          boxShadow: '$cardBoxShadow',
          overflowY: 'auto',
          overflowX: 'hidden',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
          '@mdDown': {
            transition: 'left 120ms, visibility 120ms',
            left: props.showMenu && !dismissed ? '12px' : '-300px',
            visibility: props.showMenu && !dismissed ? 'visible' : 'hidden',
          },
          zIndex: 5,
        }}
        onClick={(event) => {
          // on small screens we want to dismiss the menu after click
          // if (window.innerWidth <= 768) {
          //   setDismissed(true)
          //   setTimeout(() => {
          //     props.setShowMenu(false)
          //   }, 100)
          // }
          event.stopPropagation()
        }}
      >
        {/* This gives a header when scrolling so the menu button is visible still */}
        <Box
          css={{
            position: 'sticky',
            width: '100%',
            top: '0',
            height: '60px',
            mb: '-60px',
            bg: '$thLeftMenuBackground',
            zIndex: '100',
            visibility: props.showMenu && !dismissed ? 'visible' : 'hidden',
            display: 'flex',
            alignItems: 'center',
            gap: '9px',
            pl: '50px',
          }}
        >
          <StashMark size={22} />
          <SpanBox
            css={{
              fontFamily: '$display',
              fontSize: '17px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: '$thTextContrast',
            }}
          >
            Stash
          </SpanBox>
          <SpanBox css={{ ml: 'auto', mr: '10px', display: 'flex' }}>
            <IconButton
              label="Add a link"
              onClick={() => props.setShowAddLinkModal(true)}
            >
              <Plus size={18} />
            </IconButton>
          </SpanBox>
        </Box>
        <Box css={{ width: '100%', height: '60px' }}></Box>

        <LibraryNav {...props} />
        <Shortcuts {...props} />
        <Box
          css={{
            mt: 'auto',
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            bg: '$thLeftMenuBackground',
          }}
        >
          <ServerVersionChip />
          <NavMenuFooter showFullThemeSection={true} />
        </Box>
      </Box>
    </>
  )
}

const LibraryNav = (props: NavigationMenuProps): JSX.Element => {
  const [moreFolderSectionOpen, setMoreFolderSectionOpen] =
    usePersistedState<boolean>({
      key: 'nav-more-folder-open',
      isSessionStorage: false,
      initialValue: true,
    })
  return (
    <VStack
      css={{
        m: '0px',
        mt: '10px',
        gap: '5px',
        width: '100%',
        borderBottom: '1px solid $thBorderSubtle',
        px: '0px',
        pb: '15px',
      }}
      alignment="start"
      distribution="start"
    >
      <NavButton
        {...props}
        text="Edition"
        section="home"
        isSelected={props.section == 'home'}
        icon={<House size={18} />}
      />
      <NavButton
        {...props}
        text="Library"
        section="library"
        isSelected={props.section == 'library'}
        icon={<Books size={18} />}
        count={<NavCount folder="inbox" query="is:unread" />}
      />
      <NavButton
        {...props}
        text="Discover"
        section="l/discover"
        isSelected={props.section == 'discover'}
        icon={<Compass size={18} />}
      />
      <NavButton
        {...props}
        text="Feeds"
        section="subscriptions"
        isSelected={props.section == 'subscriptions'}
        icon={<Rss size={18} />}
        count={<NavCount folder="following" query="-is:seen" />}
      />
      <NavButton
        {...props}
        text="Highlights"
        section="highlights"
        isSelected={props.section == 'highlights'}
        icon={<Highlighter size={18} />}
      />

      <NavButton
        {...props}
        text="Archive"
        section="archive"
        isSelected={props.section == 'archive'}
        icon={<Archive size={18} />}
      />
      <NavButton
        {...props}
        text="Trash"
        section="trash"
        isSelected={props.section == 'trash'}
        icon={<Trash size={18} />}
      />
    </VStack>
  )
}

// A Mail-style count beside a section: unread in the Library, unseen in
// Feeds. Nothing shows at zero.
function NavCount(props: {
  folder: string
  query: string
}): JSX.Element | null {
  const { data } = useGetLibraryItems(
    `nav-count-${props.folder}`,
    props.folder,
    {
      limit: 1,
      sortDescending: true,
      searchQuery: props.query,
      includeCount: true,
    },
    true,
    2 * 60 * 1000
  )
  const count = data?.pages[0]?.pageInfo.totalCount ?? 0
  if (!count) return null
  return (
    <SpanBox
      aria-label={`${count} new`}
      css={{
        ml: 'auto',
        fontFamily: '$mono',
        fontSize: '11px',
        color: '$stMuted',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {count > 999 ? '999+' : count}
    </SpanBox>
  )
}

const Shortcuts = (props: NavigationMenuProps): JSX.Element | null => {
  const router = useRouter()
  const { data: shortcuts, isLoading } = useGetShortcuts()
  const treeRef = useRef<TreeApi<Shortcut> | undefined>(undefined)
  const resetShortcuts = useResetShortcuts()

  const createNewFolder = useCallback(async () => {
    if (treeRef.current) {
      const result = await treeRef.current.create({
        type: 'internal',
        index: 0,
      })
    }
  }, [treeRef])

  const resetShortcutsToDefault = useCallback(async () => {
    await resetShortcuts.mutateAsync()
  }, [])

  // An empty Shortcuts heading is just noise; Settings › Shortcuts adds them.
  if (!isLoading && !shortcuts?.length) {
    return null
  }

  return (
    <VStack
      css={{
        m: '0px',
        gap: '8px',
        width: '100%',
        px: '0px',
        pb: '25px',
      }}
      alignment="start"
      distribution="start"
    >
      <HStack
        alignment="center"
        distribution="start"
        css={{ width: '100%', pr: '0px' }}
      >
        <StyledText
          css={{
            fontFamily: '$display',
            fontSize: '14px',
            lineHeight: '125%',
            color: '$homeTextSubtle',
            mb: '10px',
            px: '15px',
          }}
        >
          Shortcuts
        </StyledText>
        <SpanBox css={{ display: 'flex', ml: 'auto', mt: '5px', mr: '15px' }}>
          <Dropdown
            side="bottom"
            triggerElement={<DotsThree size={20} />}
            css={{ ml: 'auto' }}
          >
            <DropdownOption
              onSelect={() => {
                router.push(`/settings/shortcuts`)
              }}
              title="Edit shortcuts"
            />
            <DropdownOption
              onSelect={resetShortcutsToDefault}
              title="Reset to default"
            />
            <DropdownOption
              onSelect={createNewFolder}
              title="Create new folder"
            />
          </Dropdown>
        </SpanBox>
      </HStack>
      <Box
        css={{
          width: '100%',
          height: '100%',
          '[role="treeitem"]': {
            outline: 'none',
          },
          '[role="treeitem"]:focus': {
            outline: 'none',
          },
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <ShortcutsTree treeRef={treeRef} />
      </Box>
    </VStack>
  )
}

type NavButtonProps = {
  text: string
  icon: ReactNode
  count?: ReactNode

  isSelected: boolean
  section: NavigationSection

  setShowMenu: (show: boolean) => void
}

function NavButton(props: NavButtonProps): JSX.Element {
  const router = useRouter()

  return (
    <HStack
      alignment="center"
      distribution="start"
      css={{
        mb: '1px',
        mx: '10px',
        gap: '10px',
        display: 'flex',
        width: 'calc(100% - 20px)',
        maxWidth: 'calc(100% - 20px)',
        height: '36px',
        px: '10px',

        backgroundColor: props.isSelected
          ? '$thLibrarySelectionColor'
          : 'unset',
        fontSize: '14px',
        fontWeight: props.isSelected ? '500' : '400',
        fontFamily: '$display',
        color: props.isSelected
          ? '$thLibraryMenuSecondary'
          : '$thLibraryMenuUnselected',
        verticalAlign: 'middle',
        borderRadius: '8px',
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        '&:hover': {
          backgroundColor: props.isSelected
            ? '$thLibrarySelectionColor'
            : '$thBackground4',
        },
        '&:active': {
          backgroundColor: props.isSelected
            ? '$thLibrarySelectionColor'
            : '$thBackground4',
        },
      }}
      title={props.text}
      onClick={(e) => {
        router.push(`/` + props.section)
      }}
    >
      {props.icon}
      {props.text}
      {props.count}
    </HStack>
  )
}
