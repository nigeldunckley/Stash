import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SettingsGroup,
  SettingsLede,
  SettingsLink,
  SettingsMeter,
  SettingsRow,
  SettingsRowButton,
  SettingsTextField,
  SettingsTitle,
} from '../../components/elements/stash/Settings'
import { ConfirmationModal } from '../../components/patterns/ConfirmationModal'
import { SettingsLayout } from '../../components/templates/SettingsLayout'
import { useGetLibraryItems } from '../../lib/networking/library_items/useLibraryItems'
import { emptyTrashMutation } from '../../lib/networking/mutations/emptyTrashMutation'
import { updateEmailMutation } from '../../lib/networking/mutations/updateEmailMutation'
import { updateUserMutation } from '../../lib/networking/mutations/updateUserMutation'
import { updateUserProfileMutation } from '../../lib/networking/mutations/updateUserProfileMutation'
import { useGetViewerQuery } from '../../lib/networking/queries/useGetViewerQuery'
import { useValidateUsernameQuery } from '../../lib/networking/queries/useValidateUsernameQuery'
import {
  createExport,
  useGetExports,
} from '../../lib/networking/useCreateExport'
import { shortTimeAgo } from '../../lib/textFormatting'
import { applyStoredTheme } from '../../lib/themeUpdater'
import { showErrorToast, showSuccessToast } from '../../lib/toastHelpers'
import { Switch } from '../../components/elements/stash/Switch'
import { usePersistedState } from '../../lib/hooks/usePersistedState'
import { playMomentSound, SOUNDS_KEY } from '../../lib/moments'

const ACCOUNT_LIMIT = 50_000

export default function Account(): JSX.Element {
  const { viewerData, mutate } = useGetViewerQuery()
  const me = viewerData?.me
  const [confirm, setConfirm] = useState<'email' | 'trash' | undefined>()
  const pendingEmail = useRef<{
    email: string
    done: (ok: boolean) => void
  }>()

  // Check a new username as it's typed, once typing pauses.
  const [usernameDraft, setUsernameDraft] = useState('')
  const [debouncedUsername, setDebouncedUsername] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUsername(usernameDraft), 600)
    return () => clearTimeout(timer)
  }, [usernameDraft])
  const { usernameErrorMessage, isLoading: checkingUsername } =
    useValidateUsernameQuery({ username: debouncedUsername })
  const usernameEdited =
    !!usernameDraft && usernameDraft !== me?.profile.username
  const usernameError =
    usernameEdited && !checkingUsername && usernameErrorMessage
      ? usernameErrorMessage
      : undefined

  const { data: itemsPages, isLoading } = useGetLibraryItems('search', 'all', {
    limit: 0,
    searchQuery: '',
    sortDescending: false,
    includeCount: true,
  })
  const libraryCount = useMemo(
    () => itemsPages?.pages.find(() => true)?.pageInfo.totalCount ?? 0,
    [itemsPages]
  )

  applyStoredTheme()

  const saveEmail = async (email: string): Promise<boolean> => {
    const response = await updateEmailMutation({ email })
    if (!response) {
      showErrorToast('Couldn’t update your email')
      return false
    }
    if (response.verificationEmailSent) {
      showSuccessToast('Check your inbox to confirm your new email')
    }
    mutate()
    return true
  }

  return (
    <SettingsLayout>
      <SettingsTitle>Account</SettingsTitle>
      <SettingsLede>Changes save as soon as you leave a field.</SettingsLede>

      <SettingsGroup
        title="Profile"
        footerTone={usernameError ? 'error' : undefined}
        footer={
          usernameError
            ? usernameError
            : usernameEdited && !checkingUsername
            ? 'That username is available.'
            : 'Your username appears in links to your saved items. Use letters, numbers and underscores. Changing it may break links shared from other apps.'
        }
      >
        <SettingsTextField
          label="Name"
          value={me?.name ?? ''}
          placeholder="Your name"
          autoComplete="name"
          onSave={async (name) => {
            const updated = await updateUserMutation({ name, bio: '' })
            if (!updated) showErrorToast('Couldn’t update your name')
            else mutate()
            return !!updated
          }}
        />
        <SettingsTextField
          label="Username"
          value={me?.profile.username ?? ''}
          placeholder="username"
          autoComplete="username"
          onChange={setUsernameDraft}
          onSave={async (username) => {
            if (!me?.id || usernameError) {
              if (usernameError) showErrorToast(usernameError)
              return false
            }
            const updated = await updateUserProfileMutation({
              userId: me.id,
              username,
            })
            if (!updated) showErrorToast('Couldn’t update your username')
            else mutate()
            setUsernameDraft('')
            return !!updated
          }}
        />
        <SettingsTextField
          label="Email"
          type="email"
          value={me?.email ?? ''}
          placeholder="you@example.com"
          autoComplete="email"
          onSave={(email) => {
            if (me?.source == 'EMAIL') return saveEmail(email)
            // Moving from a social sign-in to email can't be undone, so ask.
            return new Promise<boolean>((done) => {
              pendingEmail.current = { email, done }
              setConfirm('email')
            })
          }}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Library"
        footer={`This is a soft limit of ${ACCOUNT_LIMIT.toLocaleString()} items.`}
      >
        <SettingsRow label="Saved items">
          {!isLoading && (
            <>
              <span>
                {libraryCount.toLocaleString()} of{' '}
                {ACCOUNT_LIMIT.toLocaleString()}
              </span>
              <SettingsMeter aria-hidden="true">
                <i
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(1, (libraryCount / ACCOUNT_LIMIT) * 100)
                    )}%`,
                  }}
                />
              </SettingsMeter>
            </>
          )}
        </SettingsRow>
        <SettingsRowButton destructive onClick={() => setConfirm('trash')}>
          Empty Trash…
        </SettingsRowButton>
      </SettingsGroup>

      <ExportGroup />

      <DeviceGroup />

      <SettingsGroup footer="Deletes your account, saved items, highlights and notes.">
        <SettingsRowButton
          destructive
          onClick={() => {
            window.location.href = '/settings/delete-my-account'
          }}
        >
          Delete account…
        </SettingsRowButton>
      </SettingsGroup>

      {confirm == 'email' && (
        <ConfirmationModal
          message="Switch to signing in with email? You won’t be able to switch back."
          acceptButtonLabel="Switch to email"
          onAccept={async () => {
            const pending = pendingEmail.current
            pendingEmail.current = undefined
            setConfirm(undefined)
            if (pending) pending.done(await saveEmail(pending.email))
          }}
          onOpenChange={() => {
            pendingEmail.current?.done(false)
            pendingEmail.current = undefined
            setConfirm(undefined)
          }}
        />
      )}
      {confirm == 'trash' && (
        <ConfirmationModal
          message="Permanently delete everything in Trash?"
          acceptButtonLabel="Empty Trash"
          onAccept={async () => {
            setConfirm(undefined)
            const ok = await emptyTrashMutation()
            if (ok) showSuccessToast('Trash emptied')
            else showErrorToast('Couldn’t empty Trash')
          }}
          onOpenChange={() => setConfirm(undefined)}
        />
      )}
    </SettingsLayout>
  )
}

const STATE_LABELS: Record<string, string> = {
  PENDING: 'Waiting',
  RUNNING: 'Preparing',
  SUCCEEDED: 'Ready',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

function ExportGroup(): JSX.Element {
  const { data: recentExports, refetch } = useGetExports()
  const [starting, setStarting] = useState(false)

  return (
    <SettingsGroup
      title="Export"
      footer="You can export once a day. A link arrives by email, usually within the hour, and works for 24 hours."
    >
      <SettingsRowButton
        disabled={starting}
        onClick={async () => {
          setStarting(true)
          const ok = await createExport()
          setStarting(false)
          if (ok) {
            showSuccessToast('Export started')
            refetch()
          } else {
            showErrorToast('Couldn’t start an export')
          }
        }}
      >
        {starting ? 'Starting export…' : 'Export all data'}
      </SettingsRowButton>
      {recentExports?.slice(0, 5).map((item) => {
        const progress =
          item.totalItems && item.totalItems > 0
            ? `${item.processedItems ?? 0} of ${item.totalItems}`
            : undefined
        return (
          <SettingsRow
            key={item.id}
            label={
              <span title={item.createdAt}>{shortTimeAgo(item.createdAt)}</span>
            }
          >
            {item.signedUrl ? (
              <SettingsLink
                href={item.signedUrl}
                target="_blank"
                rel="noreferrer"
              >
                Download
              </SettingsLink>
            ) : (
              <span>
                {STATE_LABELS[item.state] ?? item.state}
                {progress && ` · ${progress}`}
              </span>
            )}
          </SettingsRow>
        )
      })}
    </SettingsGroup>
  )
}

// Settings kept on this device only.
function DeviceGroup(): JSX.Element {
  const [sounds, setSounds] = usePersistedState<boolean>({
    key: SOUNDS_KEY,
    initialValue: false,
  })
  return (
    <SettingsGroup
      title="This device"
      footer="A soft paper sound when you save, and a drawer closing when you archive."
    >
      <SettingsRow label="Sounds">
        <Switch
          label="Sounds"
          checked={sounds}
          onChange={(on) => {
            setSounds(on)
            if (on) playMomentSound('saved', true)
          }}
        />
      </SettingsRow>
    </SettingsGroup>
  )
}
