import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'
import { ArrowLeft, SignOut } from '@phosphor-icons/react'
import { styled } from '../../tokens/stitches.config'
import { StashMark } from '../../elements/images/OmnivoreNameLogo'
import { DEFAULT_HOME_PATH } from '../../../lib/navigations'
import { LIBRARY_LEFT_MENU_WIDTH } from './NavigationMenu'
import { MOBILE_TOP_BAR_HEIGHT } from './MobileTopBar'

type SettingsItem = { name: string; destination: string }
type SettingsGroup = { title: string; items: SettingsItem[] }

// Pages Stash doesn't use (Emails, Rules, Webhooks, Subscriptions) still
// work from their URLs but are left out of the menu.
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: 'You',
    items: [{ name: 'Account', destination: '/settings/account' }],
  },
  {
    title: 'Saving',
    items: [
      { name: 'Feeds', destination: '/settings/feeds' },
      { name: 'Suggested feeds', destination: '/settings/suggestions' },
      { name: 'Save from Safari', destination: '/settings/save' },
      { name: 'Install', destination: '/settings/installation' },
    ],
  },
  {
    title: 'Organising',
    items: [
      { name: 'Labels', destination: '/settings/labels' },
      { name: 'Saved searches', destination: '/settings/saved-searches' },
      { name: 'Pinned searches', destination: '/settings/pinned-searches' },
    ],
  },
  {
    title: 'Connections',
    items: [
      { name: 'Integrations', destination: '/settings/integrations' },
      { name: 'API keys', destination: '/settings/api' },
    ],
  },
  {
    title: 'Advanced',
    items: [{ name: 'Developer', destination: '/settings/developer' }],
  },
]

export const SETTINGS_SECTION_1 = SETTINGS_GROUPS.slice(0, 3).flatMap(
  (group) => group.items
)
export const SETTINGS_SECTION_2 = SETTINGS_GROUPS.slice(3).flatMap(
  (group) => group.items
)

export const SETTINGS_ITEMS = SETTINGS_GROUPS.flatMap((group) => group.items)

// The item whose page is showing, matching sub-pages such as
// /settings/feeds/add to their section.
export const useSelectedSettingsItem = (): SettingsItem | undefined => {
  const router = useRouter()
  const path = router.asPath.split(/[?#]/)[0]
  return SETTINGS_ITEMS.find(
    (item) =>
      path === item.destination || path.startsWith(`${item.destination}/`)
  )
}

const logout = () => document.dispatchEvent(new Event('logout'))

const Panel = styled('nav', {
  position: 'fixed',
  left: '12px',
  top: '12px',
  bottom: '12px',
  width: `calc(${LIBRARY_LEFT_MENU_WIDTH} - 24px)`,
  display: 'flex',
  flexDirection: 'column',
  bg: '$thLeftMenuBackground',
  border: '1px solid $thBorderColor',
  borderRadius: '14px',
  boxShadow: '$cardBoxShadow',
  overflowY: 'auto',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
  fontFamily: '$inter',
  zIndex: 5,
  '@mdDown': { display: 'none' },
})

const Brand = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  height: '60px',
  flex: 'none',
  px: '20px',
  fontSize: '17px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: '$stInk',
})

const Back = styled(Link, {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  mx: '10px',
  px: '10px',
  height: '32px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 500,
  color: '$stMuted',
  textDecoration: 'none',
  '&:hover': { color: '$stInk', bg: '$stSunken' },
})

const Heading = styled('div', {
  px: '20px',
  pt: '18px',
  pb: '4px',
  fontSize: '22px',
  fontWeight: 500,
  letterSpacing: '-0.02em',
  color: '$stInk',
})

const GroupTitle = styled('div', {
  px: '20px',
  pt: '18px',
  pb: '6px',
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '$stMuted',
})

const Item = styled(Link, {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  mx: '10px',
  px: '10px',
  height: '32px',
  borderRadius: '6px',
  fontSize: '14px',
  color: '$stInk2',
  textDecoration: 'none',
  '&:hover': { bg: '$stSunken', color: '$stInk' },
  '&[aria-current="page"]': {
    bg: '$stSunken',
    color: '$stInk',
    fontWeight: 500,
  },
  '&[aria-current="page"]::before': {
    content: '""',
    position: 'absolute',
    left: '-10px',
    top: '8px',
    bottom: '8px',
    width: '2px',
    borderRadius: '0 2px 2px 0',
    bg: '$stAccent',
  },
})

const Footer = styled('div', {
  mt: 'auto',
  pt: '18px',
  pb: '10px',
  flex: 'none',
})

const FooterButton = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  mx: '10px',
  px: '10px',
  height: '32px',
  width: 'calc(100% - 20px)',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 500,
  color: '$stMuted',
  cursor: 'pointer',
  borderTop: '1px solid transparent',
  '&:hover': { color: '$stInk', bg: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-2px' },
})

export function SettingsMenu(): JSX.Element {
  const selected = useSelectedSettingsItem()
  return (
    <>
      <Panel aria-label="Settings">
        <Brand>
          <StashMark size={22} />
          Stash
        </Brand>
        <Back href={DEFAULT_HOME_PATH}>
          <ArrowLeft size={14} weight="bold" />
          Back to Stash
        </Back>
        <Heading>Settings</Heading>
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.title}>
            <GroupTitle>{group.title}</GroupTitle>
            {group.items.map((item) => (
              <Item
                key={item.destination}
                href={item.destination}
                aria-current={item === selected ? 'page' : undefined}
              >
                {item.name}
              </Item>
            ))}
          </div>
        ))}
        <Footer>
          <FooterButton type="button" onClick={logout}>
            <SignOut size={15} />
            Log out
          </FooterButton>
        </Footer>
      </Panel>
      <MobileSettingsBar />
    </>
  )
}

const Bar = styled('nav', {
  display: 'none',
  '@mdDown': { display: 'block' },
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 8,
  paddingTop: 'env(safe-area-inset-top, 0px)',
  background: 'color-mix(in srgb, $colors$stCanvas 86%, transparent)',
  backdropFilter: 'saturate(1.6) blur(16px)',
  WebkitBackdropFilter: 'saturate(1.6) blur(16px)',
  borderBottom: '1px solid $stLine',
  fontFamily: '$inter',
  '@media print': { display: 'none' },
})

const BarTop = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: `${MOBILE_TOP_BAR_HEIGHT}px`,
  px: '8px',
})

const BarBack = styled(Link, {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  color: '$stInk',
  WebkitTapHighlightColor: 'transparent',
  '&:active': { bg: '$stSunken' },
})

const BarTitle = styled('div', {
  flex: 1,
  fontSize: '17px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: '$stInk',
})

const BarLogout = styled('button', {
  all: 'unset',
  px: '10px',
  height: '36px',
  fontSize: '14px',
  color: '$stMuted',
  cursor: 'pointer',
})

const Chips = styled('div', {
  display: 'flex',
  gap: '6px',
  px: '16px',
  pb: '10px',
  overflowX: 'auto',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
})

const Chip = styled(Link, {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  height: '30px',
  px: '12px',
  borderRadius: '999px',
  border: '1px solid $stLine',
  bg: '$stSurface',
  fontSize: '13.5px',
  fontWeight: 500,
  color: '$stInk2',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  WebkitTapHighlightColor: 'transparent',
  '&[aria-current="page"]': {
    bg: '$stInk',
    borderColor: '$stInk',
    color: '$stCanvas',
  },
})

// Height of the iPhone bar, so the page can start below it.
export const MOBILE_SETTINGS_BAR_HEIGHT = MOBILE_TOP_BAR_HEIGHT + 40

function MobileSettingsBar(): JSX.Element {
  const selected = useSelectedSettingsItem()
  const chips = useRef<HTMLDivElement>(null)

  // Keep the current page's chip in view.
  useEffect(() => {
    const current = chips.current?.querySelector<HTMLElement>(
      '[aria-current="page"]'
    )
    if (current && chips.current) {
      chips.current.scrollLeft =
        current.offsetLeft -
        chips.current.clientWidth / 2 +
        current.clientWidth / 2
    }
  }, [selected])

  return (
    <Bar aria-label="Settings">
      <BarTop>
        <BarBack href={DEFAULT_HOME_PATH} aria-label="Back to Stash">
          <ArrowLeft size={20} />
        </BarBack>
        <BarTitle>Settings</BarTitle>
        <BarLogout type="button" onClick={logout}>
          Log out
        </BarLogout>
      </BarTop>
      <Chips ref={chips}>
        {SETTINGS_ITEMS.map((item) => (
          <Chip
            key={item.destination}
            href={item.destination}
            aria-current={item === selected ? 'page' : undefined}
          >
            {item.name}
          </Chip>
        ))}
      </Chips>
    </Bar>
  )
}
