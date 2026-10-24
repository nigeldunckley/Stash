import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  youtubeRequest,
  YouTubeStatus,
} from '../../../lib/networking/subscriptions/youtubeConnection'
import { styled } from '../../tokens/stitches.config'

const Panel = styled('section', {
  padding: '16px 0',
  color: '$stInk',
  fontFamily: '$inter',
  borderBottom: '1px solid $stLine',
  '& h3': { margin: '0 0 6px', fontSize: '$body', fontWeight: 500 },
  '& p': {
    margin: '6px 0',
    color: '$stMuted',
    fontSize: '$caption',
    lineHeight: 1.6,
    maxWidth: '65ch',
  },
})
const Actions = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginTop: '12px',
})
const Action = styled('button', {
  background: '$stSurface',
  color: '$stInk',
  border: '1px solid $stLineStrong',
  borderRadius: '$sm',
  padding: '9px 12px',
  font: 'inherit',
  fontSize: '$caption',
  cursor: 'pointer',
  minHeight: '44px',
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '&:disabled': { opacity: 0.6, cursor: 'wait' },
})

export function YouTubeConnection({
  compact = false,
}: {
  compact?: boolean
}): JSX.Element {
  const client = useQueryClient()
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['youtube-connection'],
    queryFn: () => youtubeRequest<YouTubeStatus>('status'),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  })
  const lastSync = useRef<string>()
  useEffect(() => {
    if (data?.lastSyncedAt && lastSync.current !== data.lastSyncedAt) {
      lastSync.current = data.lastSyncedAt
      void client.invalidateQueries({ queryKey: ['subscriptions'] })
      void client.invalidateQueries({ queryKey: ['libraryItems'] })
    }
  }, [data?.lastSyncedAt, client])
  const [busy, setBusy] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  const act = async (name: string) => {
    setBusy(name)
    setMessage(undefined)
    const popup =
      name === 'connect' ? window.open('about:blank', '_blank') : null
    if (popup) popup.opener = null
    try {
      if (name === 'connect') {
        const result = await youtubeRequest<{ authorizationUrl: string }>(
          'connect',
          true
        )
        if (popup) popup.location.href = result.authorizationUrl
        else window.location.assign(result.authorizationUrl)
        setMessage('Finish connecting in your browser, then return to Stash.')
      } else {
        await youtubeRequest(name, true)
        setMessage(
          name === 'sync'
            ? 'Sync requested. Your channels will update shortly.'
            : 'YouTube disconnected. Your saved videos remain in Stash.'
        )
      }
      setConfirming(false)
      await refetch()
      await client.invalidateQueries({ queryKey: ['subscriptions'] })
      await client.invalidateQueries({ queryKey: ['libraryItems'] })
    } catch (e) {
      popup?.close()
      setMessage(e instanceof Error ? e.message : 'Try again shortly.')
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <Panel aria-label="YouTube connection">
      <details open={compact ? undefined : true}>
        <summary>
          YouTube{data?.connected ? ` · ${data.channelTitle}` : ' connection'}
        </summary>
        {isPending ? (
          <p role="status">Checking connection…</p>
        ) : error ? (
          <p role="alert">
            Could not check your YouTube connection.{' '}
            <Action onClick={() => void refetch()}>Try again</Action>
          </p>
        ) : !data?.configured ? (
          <p>
            Your server needs YouTube API credentials before you can connect.
            See the YouTube setup guide included with Stash.
          </p>
        ) : (
          <>
            <p>
              {data.connected
                ? `Connected as ${data.channelTitle}. ${data.importedChannels} imported channels.`
                : 'Bring your YouTube subscriptions into Watch. New subscriptions and uploads arrive automatically.'}
            </p>
            {data.lastSyncedAt && (
              <p>Last synced {new Date(data.lastSyncedAt).toLocaleString()}.</p>
            )}
            {(data.syncing || data.authorizing) && (
              <p role="status">
                {data.authorizing
                  ? 'Waiting for Google authorization…'
                  : 'Syncing your subscriptions…'}
              </p>
            )}
            {data.error && <p role="alert">{data.error}</p>}
            <Actions>
              {!data.connected ? (
                <Action
                  disabled={!!busy || data.authorizing}
                  onClick={() => void act('connect')}
                >
                  {busy === 'connect'
                    ? 'Opening Google…'
                    : data.error
                    ? 'Reconnect YouTube'
                    : 'Connect YouTube'}
                </Action>
              ) : (
                <>
                  <Action
                    disabled={!!busy || data.syncing}
                    onClick={() => void act('sync')}
                  >
                    {busy === 'sync' || data.syncing ? 'Syncing…' : 'Sync now'}
                  </Action>
                  <Action
                    disabled={!!busy}
                    onClick={() =>
                      confirming ? void act('disconnect') : setConfirming(true)
                    }
                  >
                    {busy === 'disconnect'
                      ? 'Disconnecting…'
                      : confirming
                      ? 'Confirm disconnect'
                      : 'Disconnect'}
                  </Action>
                  {confirming && (
                    <Action onClick={() => setConfirming(false)}>Cancel</Action>
                  )}
                </>
              )}
            </Actions>
            {confirming && (
              <p>
                Stops imported channel follows and removes your YouTube
                connection data. Saved videos, notes and Stash watching progress
                remain.
              </p>
            )}
          </>
        )}
        {message && <p role="status">{message}</p>}
        <p>
          Read-only access. Following here never changes YouTube. Watch Later
          and YouTube watch history are unavailable. Captions are in the YouTube
          player.
        </p>
        <p>
          Shorts are hidden in <a href="/settings/watch">Settings › Watch</a>.
          Each channel’s settings can also leave out every video under three
          minutes.
        </p>
        <p>
          <a href="/settings/youtube-privacy">YouTube privacy and data</a>
        </p>
      </details>
    </Panel>
  )
}
