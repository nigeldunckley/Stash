import { UploadSimple } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { subscribeMutation } from '../../../lib/networking/mutations/subscribeMutation'
import { SubscriptionType } from '../../../lib/networking/queries/useGetSubscriptionsQuery'
import {
  lookupYouTubeChannel,
  YouTubeChannel,
} from '../../../lib/networking/subscriptions/youtube'
import { showErrorToast, showSuccessToast } from '../../../lib/toastHelpers'
import { looksLikeYouTube } from '../../../lib/youtube'
import { CoverImage, PanelLabel, SiteIcon, Switch } from '../../elements/stash'
import { keyframes, styled } from '../../tokens/stitches.config'
import { Button, Form, Hint } from './AddFeedPanel'

const appear = keyframes({
  from: { opacity: 0, transform: 'translateY(-3px)' },
  to: { opacity: 1, transform: 'none' },
})

const Found = styled('div', {
  display: 'grid',
  gap: '12px',
  padding: '12px',
  border: '1px solid $stLine',
  borderRadius: '$md',
  animation: `${appear} 180ms ease-out`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
})

const Who = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minWidth: 0,
  '& b': {
    display: 'block',
    fontFamily: '$inter',
    fontSize: '$body',
    fontWeight: 600,
    color: '$stInk',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& small': {
    display: 'block',
    fontFamily: '$mono',
    fontSize: '$micro',
    color: '$stMuted',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})

const Minis = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '6px',
})

const Mini = styled(CoverImage, {
  aspectRatio: '16 / 9',
  borderRadius: '5px',
})

const Toggle = styled('label', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  fontFamily: '$inter',
  fontSize: '$small',
  color: '$stInk2',
})

const Import = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  paddingTop: '12px',
  borderTop: '1px solid $stLine',
})

const feedUrlFor = (channelId: string) =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`

const cadence = (perWeek?: number) => {
  if (!perWeek) return undefined
  if (perWeek >= 6) return 'about daily'
  if (perWeek >= 1.5) return `about ${Math.round(perWeek)} videos a week`
  if (perWeek >= 0.8) return 'about weekly'
  const perMonth = Math.round(perWeek * 4.3)
  return perMonth >= 1
    ? `about ${perMonth} ${perMonth == 1 ? 'video' : 'videos'} a month`
    : 'now and then'
}

// The channel IDs in a Google Takeout subscriptions.csv (Channel Id, Channel
// Url, Channel Title).
const channelIdsFromTakeout = (csv: string) =>
  Array.from(
    new Set(Array.from(csv.matchAll(/\bUC[\w-]{22}\b/g), (match) => match[0]))
  )

// Follow a YouTube channel: paste a channel link, @handle or video link, see
// the channel and its latest uploads, then subscribe.
export function AddChannelPanel(props: {
  onDone?: (feedUrl?: string) => void
}): JSX.Element {
  const queryClient = useQueryClient()
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [channel, setChannel] = useState<YouTubeChannel>()
  const [missing, setMissing] = useState(false)
  const [includeShorts, setIncludeShorts] = useState(false)
  const [progress, setProgress] = useState<string>()
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    await queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
  }

  const find = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = address.trim()
    if (!value) return
    if (!looksLikeYouTube(value)) {
      showErrorToast('Paste a YouTube channel, @handle or video link')
      return
    }
    setBusy(true)
    setChannel(undefined)
    setMissing(false)
    try {
      const found = await lookupYouTubeChannel(value)
      setChannel(found)
      setMissing(!found)
    } catch {
      showErrorToast('Could not reach YouTube. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  const subscribe = async () => {
    if (!channel) return
    setBusy(true)
    try {
      const result = await subscribeMutation({
        url: channel.feedUrl,
        subscriptionType: SubscriptionType.RSS,
        includeShorts,
      })
      const error = result.subscribe.errorCodes?.[0]
      if (error == 'ALREADY_SUBSCRIBED') {
        showSuccessToast(`You already follow ${channel.title}`)
      } else if (error) {
        showErrorToast(`Could not follow ${channel.title}`)
        return
      } else {
        showSuccessToast(`Following ${channel.title}`)
      }
      await refresh()
      setAddress('')
      setChannel(undefined)
      props.onDone?.(channel.feedUrl)
    } finally {
      setBusy(false)
    }
  }

  const importTakeout = async (file: File) => {
    const ids = channelIdsFromTakeout(await file.text())
    if (!ids.length) {
      showErrorToast('No channels found in that file')
      return
    }
    setBusy(true)
    let added = 0
    try {
      for (const [index, id] of ids.entries()) {
        setProgress(`Adding ${index + 1} of ${ids.length}…`)
        const result = await subscribeMutation({
          url: feedUrlFor(id),
          subscriptionType: SubscriptionType.RSS,
        })
        if (!result.subscribe.errorCodes?.length) added += 1
      }
      await refresh()
      showSuccessToast(
        added == ids.length
          ? `Following ${added} channels`
          : `Following ${added} of ${ids.length} channels`
      )
      props.onDone?.()
    } finally {
      setBusy(false)
      setProgress(undefined)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const detail = [channel?.handle, cadence(channel?.uploadsPerWeek)]
    .filter(Boolean)
    .join(' · ')

  return (
    <div style={{ display: 'grid', gap: 12, width: 'min(340px, 84vw)' }}>
      <PanelLabel>Add a channel</PanelLabel>
      <Form onSubmit={find}>
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          aria-label="Channel, @handle or video link"
          placeholder="Channel, @handle or video link"
          value={address}
          onChange={(event) => {
            setAddress(event.target.value)
            setMissing(false)
          }}
        />
        <Button
          primary={!channel}
          type="submit"
          disabled={busy || !address.trim()}
        >
          {busy && !channel && !progress ? 'Finding…' : 'Find'}
        </Button>
      </Form>
      {!channel && !missing && !progress && (
        <Hint>
          A link to any of a channel&apos;s videos works too. Stash follows the
          channel that posted it.
        </Hint>
      )}
      {missing && (
        <Hint>
          No YouTube channel found at that link. Check it and try again.
        </Hint>
      )}
      {channel && (
        <Found>
          <Who>
            <SiteIcon
              src={channel.avatar}
              name={channel.title}
              size={36}
              round
            />
            <div style={{ minWidth: 0 }}>
              <b>{channel.title}</b>
              {detail && <small>{detail}</small>}
            </div>
          </Who>
          {channel.videos.length > 0 && (
            <Minis>
              {channel.videos.slice(0, 3).map((video) => (
                <Mini key={video.id} src={video.thumbnail} />
              ))}
            </Minis>
          )}
          <Toggle>
            Include Shorts
            <Switch
              label="Include Shorts"
              checked={includeShorts}
              onChange={setIncludeShorts}
            />
          </Toggle>
          <Button
            primary
            disabled={busy}
            onClick={subscribe}
            css={{ background: '$stAccent', color: '$stOnAccent' }}
          >
            {busy ? 'Following…' : 'Follow channel'}
          </Button>
        </Found>
      )}
      <Import>
        <Button disabled={busy} onClick={() => fileRef.current?.click()}>
          <UploadSimple size={14} style={{ marginRight: 6 }} />
          Import from YouTube…
        </Button>
        <Hint>{progress ?? 'subscriptions.csv from Google Takeout'}</Hint>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) importTakeout(file)
          }}
        />
      </Import>
    </div>
  )
}
