import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { subscribeMutation } from '../../../lib/networking/mutations/subscribeMutation'
import { SubscriptionType } from '../../../lib/networking/queries/useGetSubscriptionsQuery'
import {
  ScannedFeed,
  scanFeeds,
} from '../../../lib/networking/subscriptions/feeds'
import { showErrorToast, showSuccessToast } from '../../../lib/toastHelpers'
import { PanelLabel } from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'

export const Form = styled('form', {
  display: 'flex',
  gap: '6px',
  input: {
    all: 'unset',
    boxSizing: 'border-box',
    flex: 1,
    minWidth: 0,
    height: '32px',
    padding: '0 10px',
    fontFamily: '$inter',
    fontSize: '$small',
    color: '$stInk',
    background: '$stSurface',
    border: '1px solid $stLine',
    borderRadius: '$sm',
    '&::placeholder': { color: '$stMuted' },
    // Safari zooms into inputs smaller than 16px.
    '@smDown': { fontSize: '16px', height: '38px' },
    '&:focus': {
      borderColor: '$stLineStrong',
      boxShadow: '0 0 0 3px $colors$stAccentTint',
    },
  },
})

export const Button = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '32px',
  padding: '0 12px',
  fontFamily: '$inter',
  fontSize: '$small',
  fontWeight: 500,
  borderRadius: '$sm',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '&:disabled': { opacity: 0.5, cursor: 'default' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  variants: {
    primary: {
      true: { background: '$stAccent', color: '$stOnAccent' },
      false: {
        color: '$stInk',
        border: '1px solid $stLine',
        '&:hover': { background: '$stSunken' },
      },
    },
  },
  defaultVariants: { primary: false },
})

const Choice = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'grid',
  gap: '2px',
  width: '100%',
  padding: '8px 10px',
  borderRadius: '$sm',
  cursor: 'pointer',
  fontFamily: '$inter',
  '&:hover': { background: '$stSunken' },
  '& > span:first-child': { fontSize: '$small', color: '$stInk' },
  '& > span:last-child': {
    fontFamily: '$mono',
    fontSize: '$micro',
    color: '$stMuted',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})

export const Hint = styled('p', {
  margin: 0,
  fontFamily: '$inter',
  fontSize: '$caption',
  lineHeight: 1.45,
  color: '$stMuted',
})

const normalise = (value: string) => {
  const trimmed = value.trim()
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    return new URL(withScheme).toString()
  } catch {
    return undefined
  }
}

// Add a feed from a site or feed address, or import feeds from an OPML file.
export function AddFeedPanel(props: { onDone?: () => void }): JSX.Element {
  const queryClient = useQueryClient()
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [choices, setChoices] = useState<ScannedFeed[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const subscribe = async (feeds: ScannedFeed[]) => {
    let added = 0
    for (const feed of feeds) {
      const result = await subscribeMutation({
        url: feed.url,
        subscriptionType: SubscriptionType.RSS,
      })
      if (!result.subscribe.errorCodes?.length) {
        added += 1
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    await queryClient.invalidateQueries({ queryKey: ['libraryItems'] })
    return added
  }

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    const url = normalise(address)
    if (!url) {
      showErrorToast('Enter a site or feed address')
      return
    }
    setBusy(true)
    setChoices([])
    try {
      let feeds: ScannedFeed[] = []
      try {
        feeds = await scanFeeds({ url })
      } catch {
        feeds = []
      }
      if (feeds.length > 1) {
        setChoices(feeds)
        return
      }
      const added = await subscribe(
        feeds.length ? feeds : [{ url, title: url }]
      )
      if (added) {
        showSuccessToast('Feed added')
        setAddress('')
        props.onDone?.()
      } else {
        showErrorToast('No feed found at that address')
      }
    } finally {
      setBusy(false)
    }
  }

  const choose = async (feed: ScannedFeed) => {
    setBusy(true)
    try {
      const added = await subscribe([feed])
      if (added) {
        showSuccessToast(`Added ${feed.title}`)
        setChoices([])
        setAddress('')
        props.onDone?.()
      } else {
        showErrorToast('Could not add that feed')
      }
    } finally {
      setBusy(false)
    }
  }

  const importOpml = async (file: File) => {
    setBusy(true)
    try {
      const feeds = await scanFeeds({ opml: await file.text() })
      if (!feeds.length) {
        showErrorToast('No feeds found in that file')
        return
      }
      const added = await subscribe(feeds)
      showSuccessToast(
        added == feeds.length
          ? `Imported ${added} feeds`
          : `Imported ${added} of ${feeds.length} feeds`
      )
      props.onDone?.()
    } catch {
      showErrorToast('Could not read that OPML file')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12, width: 'min(320px, 80vw)' }}>
      <PanelLabel>Add a feed</PanelLabel>
      <Form onSubmit={add}>
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          aria-label="Site or feed address"
          placeholder="example.com or a feed address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <Button primary type="submit" disabled={busy || !address.trim()}>
          {busy ? 'Adding…' : 'Add'}
        </Button>
      </Form>
      {choices.length > 0 && (
        <div style={{ display: 'grid', gap: 2 }}>
          <Hint>This site has more than one feed. Pick one:</Hint>
          {choices.map((feed) => (
            <Choice key={feed.url} disabled={busy} onClick={() => choose(feed)}>
              <span>{feed.title || feed.url}</span>
              <span>{feed.url}</span>
            </Choice>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button disabled={busy} onClick={() => fileRef.current?.click()}>
          Import OPML…
        </Button>
        <Hint>From another reader</Hint>
        <input
          ref={fileRef}
          type="file"
          accept=".opml,.xml,text/xml,application/xml,text/x-opml"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) importOpml(file)
          }}
        />
      </div>
    </div>
  )
}
