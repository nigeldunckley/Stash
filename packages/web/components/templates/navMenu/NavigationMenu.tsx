import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { StyledText } from '../../elements/StyledText'
import { Box, HStack, SpanBox, VStack } from '../../elements/LayoutPrimitives'
import { Button } from '../../elements/Button'
import {
  Archive,
  CaretDown,
  Compass,
  DotsThree,
  Highlighter,
  House,
  MonitorPlay,
  Newspaper,
  Plus,
  Rss,
  Trash,
} from '@phosphor-icons/react'
import { IconButton } from '../../elements/stash'
import { useGetShortcuts } from '../../../lib/networking/shortcuts/useShortcuts'
import { keyframes, styled, theme } from '../../tokens/stitches.config'
import { RibbonIcon } from '../../elements/stash/Ribbon'
import { reducedMotion, spring } from '../../elements/stash/motion'
import { MOMENT_LANDED, MomentLanded } from '../../../lib/moments'
import { Roll, useRoll } from '../../elements/stash/Roll'
import { usePersistedState } from '../../../lib/hooks/usePersistedState'
import { NavMenuFooter } from './Footer'
import { ServerVersionChip } from '../settings/ServerVersionChip'
import { StashMark } from '../../elements/images/OmnivoreNameLogo'
import { Dropdown, DropdownOption } from '../../elements/DropdownElements'
import { useRouter } from 'next/router'
import { NavigationSection } from '../NavigationLayout'
import { useEditionStatus } from '../../../lib/edition/useEdition'
import { NavCountSource, NavGroup, useNavCount, useNavGroups } from './sections'
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
          // Stays put while pages change beneath it.
          viewTransitionName: 'stash-sidebar',
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
  // The Edition appears only while this week's issue is out and unread.
  const edition = useEditionStatus()
  const groups = useNavGroups(props.section)
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
        text="Home"
        section="home"
        isSelected={props.section == 'home'}
        icon={<House size={18} />}
      />
      {(edition.out || props.section == 'edition') && (
        <NavButton
          {...props}
          text="The Edition"
          section="edition"
          isSelected={props.section == 'edition'}
          icon={<Newspaper size={18} />}
          count={edition.fresh ? <FreshDot /> : undefined}
        />
      )}
      {groups.map((group) => (
        <NavGroupSection key={group.id} group={group} {...props} />
      ))}
      <SpanBox
        css={{
          height: '1px',
          width: 'calc(100% - 40px)',
          mx: '20px',
          my: '8px',
          background: '$thBorderSubtle',
        }}
      />
      <NavButton
        {...props}
        text="Archive"
        section="archive"
        momentTarget="archived"
        isSelected={props.section == 'archive'}
        icon={<Archive size={18} />}
      />
      <NavButton
        {...props}
        text="Trash"
        section="trash"
        momentTarget="trash"
        isSelected={props.section == 'trash'}
        icon={<Trash size={18} />}
      />
    </VStack>
  )
}

const PAGE_ICONS: Record<string, ReactNode> = {
  feeds: <Rss size={18} />,
  'read-saved': <RibbonIcon size={18} />,
  highlights: <Highlighter size={18} />,
  discover: <Compass size={18} />,
  channels: <MonitorPlay size={18} />,
  'watch-saved': <RibbonIcon size={18} />,
}

const GroupLabel = styled('button', {
  all: 'unset',
  cursor: 'pointer',
  '&:hover': { color: '$thLibraryMenuSecondary' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

const GroupFold = styled('button', {
  all: 'unset',
  ml: 'auto',
  display: 'grid',
  placeItems: 'center',
  width: '22px',
  height: '22px',
  borderRadius: '6px',
  cursor: 'pointer',
  '&:hover:not(:disabled)': { background: '$thBackground4' },
  // The open group can't be folded away from under you.
  '&:disabled': { cursor: 'default', opacity: 0.35 },
  '& svg': { transition: 'transform 120ms' },
  '&[data-folded="true"] svg': { transform: 'rotate(-90deg)' },
  '&:focus-visible': { outline: '2px solid $stAccent' },
})

// A group's label opens its first page; the chevron folds the group away,
// remembered on this device. A folded Watch still shows a dot for new videos.
function NavGroupSection(
  props: NavigationMenuProps & { group: NavGroup }
): JSX.Element {
  const router = useRouter()
  const { group } = props
  const [open, setOpen] = usePersistedState<boolean>({
    key: `nav-group-open-${group.id}`,
    isSessionStorage: false,
    initialValue: true,
  })
  const expanded = open || group.selected
  return (
    <>
      <HStack
        alignment="center"
        distribution="start"
        css={{
          width: 'calc(100% - 20px)',
          mx: '10px',
          mt: '10px',
          height: '26px',
          px: '10px',
          gap: '8px',
          fontFamily: '$mono',
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: '$stMuted',
        }}
      >
        <GroupLabel type="button" onClick={() => router.push(group.href)}>
          {group.label}
        </GroupLabel>
        {!expanded && group.id == 'watch' && <FoldedNewDot group={group} />}
        <GroupFold
          type="button"
          aria-label={expanded ? `Fold ${group.label}` : `Show ${group.label}`}
          aria-expanded={expanded}
          disabled={group.selected}
          data-folded={!expanded}
          onClick={() => setOpen(!expanded)}
        >
          <CaretDown size={12} weight="bold" />
        </GroupFold>
      </HStack>
      {expanded &&
        group.pages.map((page) => (
          <NavButton
            {...props}
            key={page.key}
            text={page.label}
            section={page.section}
            href={page.href}
            isSelected={page.selected}
            child={!!page.color}
            momentTarget={
              page.key == 'saved'
                ? group.id == 'watch'
                  ? 'watch-saved'
                  : 'saved'
                : page.key.startsWith('collection-')
                ? page.key
                : undefined
            }
            icon={
              page.color ? (
                <SpanBox
                  css={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    flex: 'none',
                  }}
                  style={{ background: page.color }}
                />
              ) : (
                PAGE_ICONS[page.key == 'saved' ? `${group.id}-saved` : page.key]
              )
            }
            count={page.count && <NavCount source={page.count} />}
          />
        ))}
    </>
  )
}

function FoldedNewDot(props: { group: NavGroup }): JSX.Element | null {
  const count = useNavCount(props.group.pages[0]?.count)
  if (!count) return null
  return (
    <SpanBox
      aria-label={`${count} new`}
      css={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '$stAccent',
      }}
    />
  )
}

// A Mail-style count beside a page: unseen in Feeds, unread in Saved. Nothing
// shows at zero. New videos show as an orange badge, so they are hard to
// miss, and Discover's new suggestions in the accent colour.
function NavCount(props: { source: NavCountSource }): JSX.Element | null {
  const count = useNavCount(props.source)
  const rolled = useRoll(count)
  if (!count) return null
  const discover = props.source.kind == 'discover'
  const accent = props.source.kind == 'items' && props.source.accent
  return (
    <SpanBox
      aria-label={`${count} new`}
      css={{
        ml: 'auto',
        fontFamily: '$mono',
        fontSize: '11px',
        color: discover ? '$stAccentText' : '$stMuted',
        fontVariantNumeric: 'tabular-nums',
        ...(accent && {
          padding: '0 6px',
          lineHeight: '18px',
          borderRadius: '5px',
          background: '$stAccent',
          color: '$stOnAccent',
          fontWeight: 500,
        }),
      }}
    >
      {discover ? (
        `${count} new`
      ) : rolled.from !== undefined && !accent ? (
        <Roll key={rolled.key}>
          <span>{label(rolled.from)}</span>
          <span>{label(count)}</span>
        </Roll>
      ) : (
        label(count)
      )}
    </SpanBox>
  )
}

const label = (count: number) => (count > 999 ? '999+' : count)

// The icon swallows the item, then springs back.
const dip = keyframes({
  '0%': { transform: 'scale(1)' },
  '30%': { transform: 'scale(0.78) translateY(1px)' },
  '65%': { transform: 'scale(1.14)' },
  '100%': { transform: 'scale(1)' },
})

const plusOne = keyframes({
  '0%': { opacity: 0, transform: 'translateY(4px)' },
  '20%, 70%': { opacity: 1, transform: 'translateY(0)' },
  '100%': { opacity: 0, transform: 'translateY(-4px)' },
})

const NavIcon = styled('span', {
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  transition: 'color 200ms',
  '[data-landed] > &': {
    color: '$stAccent',
    animation: `${dip} 420ms ${spring}`,
  },
  [reducedMotion]: { '[data-landed] > &': { animation: 'none' } },
})

const PlusOne = styled('span', {
  marginLeft: 'auto',
  fontFamily: '$mono',
  fontSize: '11px',
  color: '$stAccentText',
  animation: `${plusOne} 1200ms ease forwards`,
})

// True for a moment after a saved or archived item lands on this row.
function useLanded(target: string | undefined): boolean {
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    if (!target) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onLanded = (event: Event) => {
      if ((event as CustomEvent<MomentLanded>).detail.target != target) return
      setLanded(false)
      requestAnimationFrame(() => setLanded(true))
      clearTimeout(timer)
      timer = setTimeout(() => setLanded(false), 1200)
    }
    window.addEventListener(MOMENT_LANDED, onLanded)
    return () => {
      window.removeEventListener(MOMENT_LANDED, onLanded)
      clearTimeout(timer)
    }
  }, [target])
  return landed
}

// A new issue of The Edition that hasn't been opened yet.
function FreshDot(): JSX.Element {
  return (
    <SpanBox
      aria-label="New issue"
      css={{
        ml: 'auto',
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: '$stAccent',
        flex: 'none',
      }}
    />
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
  // Sits under the entry above it, as Discover does under Feeds.
  child?: boolean
  text: string
  icon: ReactNode
  count?: ReactNode
  // Where to go, when not the section's own page.
  href?: string
  // Saved, Archive, Trash and collections take in items sent to them.
  momentTarget?: string

  isSelected: boolean
  section: NavigationSection

  setShowMenu: (show: boolean) => void
}

function NavButton(props: NavButtonProps): JSX.Element {
  const router = useRouter()
  const landed = useLanded(props.momentTarget)

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
        height: props.child ? '32px' : '36px',
        px: '10px',
        pl: props.child ? '28px' : '10px',

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
      data-nav={props.section}
      data-moment-target={props.momentTarget}
      data-landed={landed ? '' : undefined}
      onClick={(e) => {
        router.push(props.href ?? `/` + props.section)
      }}
    >
      <NavIcon>{props.icon}</NavIcon>
      {props.text}
      {landed && props.momentTarget == 'archived' && !props.count ? (
        <PlusOne aria-hidden="true">+1</PlusOne>
      ) : (
        props.count
      )}
    </HStack>
  )
}
