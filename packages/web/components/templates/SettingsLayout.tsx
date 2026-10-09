import { useCallback, useEffect, useState } from 'react'
import { styled } from '../tokens/stitches.config'
import { applyStoredTheme } from '../../lib/themeUpdater'
import { ConfirmationModal } from '../patterns/ConfirmationModal'
import { KeyboardShortcutListModal } from './KeyboardShortcutListModal'
import { PageMetaData } from '../patterns/PageMetaData'
import { useLogout } from '../../lib/logout'
import {
  MOBILE_SETTINGS_BAR_HEIGHT,
  SettingsMenu,
  SETTINGS_GROUPS,
  useSelectedSettingsItem,
} from './navMenu/SettingsMenu'
import { useVerifyAuth } from '../../lib/hooks/useVerifyAuth'
import { LIBRARY_LEFT_MENU_WIDTH } from './navMenu/NavigationMenu'

type SettingsLayoutProps = {
  title?: string
  children: React.ReactNode
}

const Page = styled('div', {
  minHeight: '100vh',
  width: '100%',
  bg: '$thBackground',
  paddingLeft: LIBRARY_LEFT_MENU_WIDTH,
  '@mdDown': {
    paddingLeft: 0,
    paddingTop: `calc(${MOBILE_SETTINGS_BAR_HEIGHT}px + env(safe-area-inset-top, 0px))`,
  },
})

// The settings pages came from Omnivore and each draws its own content.
// This column gives them Stash's width, type and controls.
const Content = styled('main', {
  width: '100%',
  maxWidth: '880px',
  mx: 'auto',
  padding: '36px 40px 120px',
  boxSizing: 'border-box',
  fontFamily: '$inter',
  color: '$stInk2',
  '@mdDown': { padding: '20px 16px 96px' },

  '& h1, & h2, & h3': {
    fontFamily: '$inter',
    color: '$stInk',
    letterSpacing: '-0.02em',
  },
  '& a': {
    color: 'inherit',
    textDecorationColor: '$stAccent',
    textUnderlineOffset: '0.2em',
  },
  '& input:not([type=checkbox]):not([type=radio]), & textarea, & select': {
    fontFamily: '$inter',
    fontSize: '14px',
    color: '$stInk',
    bg: '$stSurface',
    border: '1px solid $stLine',
    borderRadius: '6px',
    boxSizing: 'border-box',
  },
  '& input:focus, & textarea:focus, & select:focus': {
    outline: 'none',
    borderColor: '$stInk',
    boxShadow: '0 0 0 3px $colors$stAccentTint',
  },
})

const Kicker = styled('div', {
  fontFamily: '$mono',
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '$stMuted',
  mb: '4px',
  '@mdDown': { display: 'none' },
})

export function SettingsLayout(props: SettingsLayoutProps): JSX.Element {
  useVerifyAuth()

  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false)
  const [showKeyboardCommandsModal, setShowKeyboardCommandsModal] =
    useState(false)

  applyStoredTheme()

  const showLogout = useCallback(() => {
    setShowLogoutConfirmation(true)
  }, [setShowLogoutConfirmation])

  useEffect(() => {
    document.addEventListener('logout', showLogout)

    return () => {
      document.removeEventListener('logout', showLogout)
    }
  }, [showLogout])

  const { logout } = useLogout()

  const selected = useSelectedSettingsItem()
  const group = SETTINGS_GROUPS.find((group) =>
    group.items.some((item) => item === selected)
  )

  return (
    <Page>
      <PageMetaData
        path="settings"
        title={selected ? `${selected.name} · Settings` : 'Settings'}
      />
      <SettingsMenu />
      <Content>
        {group && <Kicker>Settings · {group.title}</Kicker>}
        {props.children}
      </Content>
      {showLogoutConfirmation ? (
        <ConfirmationModal
          message={'Are you sure you want to log out?'}
          onAccept={logout}
          onOpenChange={() => setShowLogoutConfirmation(false)}
        />
      ) : null}
      {showKeyboardCommandsModal ? (
        <KeyboardShortcutListModal
          onOpenChange={() => setShowKeyboardCommandsModal(false)}
        />
      ) : null}
    </Page>
  )
}
