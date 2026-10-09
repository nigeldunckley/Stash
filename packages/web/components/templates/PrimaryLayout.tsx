import { PageMetaData, PageMetaDataProps } from '../patterns/PageMetaData'
import { Box } from '../elements/LayoutPrimitives'
import { ReactNode, useEffect, useState, useCallback } from 'react'
import { useKeyboardShortcuts } from '../../lib/keyboardShortcuts/useKeyboardShortcuts'
import { ConfirmationModal } from '../patterns/ConfirmationModal'
import { KeyboardShortcutListModal } from './KeyboardShortcutListModal'
import { setupAnalytics } from '../../lib/analytics'
import { primaryCommands } from '../../lib/keyboardShortcuts/navigationShortcuts'
import { useLogout } from '../../lib/logout'
import { useApplyLocalTheme } from '../../lib/hooks/useApplyLocalTheme'
import { useGetViewer } from '../../lib/networking/viewer/useGetViewer'

type PrimaryLayoutProps = {
  children: ReactNode
  pageTestId: string
  hideHeader?: boolean
  pageMetaDataProps?: PageMetaDataProps
  headerToolbarControl?: JSX.Element
  alwaysDisplayToolbar?: boolean
  onDoubleClick?: (e: React.MouseEvent<HTMLElement, MouseEvent>) => void
}

export function PrimaryLayout(props: PrimaryLayoutProps): JSX.Element {
  useApplyLocalTheme()

  const { data: viewerData } = useGetViewer()
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false)
  const [showKeyboardCommandsModal, setShowKeyboardCommandsModal] =
    useState(false)

  useKeyboardShortcuts(
    primaryCommands((action) => {
      switch (action) {
        case 'toggleShortcutHelpModalDisplay':
          setShowKeyboardCommandsModal(true)
          break
      }
    })
  )

  // Attempt to identify the user if they are logged in.
  useEffect(() => {
    if (viewerData) {
      setupAnalytics(viewerData)
    }
  }, [viewerData])

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

  return (
    <>
      {props.pageMetaDataProps ? (
        <PageMetaData {...props.pageMetaDataProps} />
      ) : null}
      <Box
        css={{
          height: '100%',
          width: '100%',
          bg: '$thBackground2',
        }}
        onDoubleClick={props.onDoubleClick ?? function (_evt) {}}
      >
        {props.children}
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
      </Box>
      <div data-testid={props.pageTestId} />
    </>
  )
}
