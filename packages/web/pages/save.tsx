import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { PageMetaData } from '../components/patterns/PageMetaData'
import { keyframes, styled } from '../components/tokens/stitches.config'
import { applyStoredTheme } from '../lib/themeUpdater'
import type { SaveApiResponse } from './api/save'

// Opened by the "Save to Stash" button on the Safari Favourites bar, usually
// as a small popup window. It saves the page with the browser's own sign-in,
// says so, then closes itself.

type Status =
  | { kind: 'saving' }
  | { kind: 'saved'; alreadySaved: boolean }
  | { kind: 'signed-out' }
  | { kind: 'failed'; message: string }

const appear = keyframes({
  from: { opacity: 0, transform: 'scale(0.96)' },
  to: { opacity: 1, transform: 'none' },
})

const Page = styled('main', {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '24px 16px',
  boxSizing: 'border-box',
  background: '$stCanvas',
})

const Card = styled('div', {
  width: '100%',
  maxWidth: '360px',
  display: 'grid',
  gap: '14px',
  padding: '20px',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$lg',
  animation: `${appear} 180ms ease-out`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
})

const Head = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontFamily: '$inter',
  fontSize: '$body',
  fontWeight: 600,
  color: '$stInk',
  '& svg': { flex: 'none' },
})

const Where = styled('p', {
  margin: 0,
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

const Body = styled('p', {
  margin: 0,
  fontFamily: '$inter',
  fontSize: '$small',
  lineHeight: 1.45,
  color: '$stInk2',
  '& a': { color: '$stAccentText', fontWeight: 500 },
})

const Spinner = styled('span', {
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  border: '2px solid $stLine',
  borderTopColor: '$stAccent',
  animation: `${keyframes({
    to: { transform: 'rotate(360deg)' },
  })} 700ms linear infinite`,
})

export default function SavePage(): JSX.Element {
  const router = useRouter()
  const [status, setStatus] = useState<Status>({ kind: 'saving' })
  const [inPopup, setInPopup] = useState(false)
  const started = useRef(false)
  const target = typeof router.query.url === 'string' ? router.query.url : ''

  useEffect(() => {
    applyStoredTheme()
    setInPopup(!!window.opener)
  }, [])

  useEffect(() => {
    if (!router.isReady || started.current) return
    started.current = true
    if (!target) {
      setStatus({ kind: 'failed', message: 'There was no page to save.' })
      return
    }
    fetch('/api/save', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ url: target }),
    })
      .then(async (res) => {
        const data = (await res.json()) as SaveApiResponse
        if (data.saved) {
          setStatus({ kind: 'saved', alreadySaved: !!data.alreadySaved })
        } else if (res.status === 401) {
          setStatus({ kind: 'signed-out' })
        } else {
          setStatus({ kind: 'failed', message: data.message })
        }
      })
      .catch(() =>
        setStatus({
          kind: 'failed',
          message: "Couldn't reach Stash. Check your connection and try again.",
        })
      )
  }, [router.isReady, target])

  // A popup closes itself once the save is confirmed. When the browser
  // blocked the popup and this page replaced the article, stay put so the
  // reader can go back to it.
  useEffect(() => {
    if (status.kind !== 'saved' || !inPopup) return
    const timer = setTimeout(() => window.close(), 1400)
    return () => clearTimeout(timer)
  }, [status, inPopup])

  let host = ''
  try {
    host = new URL(target).hostname.replace(/^www\./, '')
  } catch {
    // shown without a host
  }

  return (
    <>
      <PageMetaData title="Save to Stash" path="/save" />
      <Page>
        <Card role="status" aria-live="polite">
          {status.kind === 'saving' && (
            <Head>
              <Spinner aria-hidden />
              Saving to Stash
            </Head>
          )}
          {status.kind === 'saved' && (
            <Head>
              <CheckCircle
                size={20}
                weight="fill"
                color="var(--colors-stAccent)"
              />
              {status.alreadySaved ? 'Already in Stash' : 'Saved to Stash'}
            </Head>
          )}
          {status.kind === 'signed-out' && (
            <Head>
              <WarningCircle
                size={20}
                weight="fill"
                color="var(--colors-stAccent)"
              />
              Sign in to save
            </Head>
          )}
          {status.kind === 'failed' && (
            <Head>
              <WarningCircle
                size={20}
                weight="fill"
                color="var(--colors-stAccent)"
              />
              Not saved
            </Head>
          )}
          {host && <Where>{host}</Where>}
          {status.kind === 'signed-out' && (
            <Body>
              This browser isn&apos;t signed in to Stash.{' '}
              <a href="/login" target="_blank" rel="noreferrer">
                Sign in
              </a>
              , then click Save to Stash again.
            </Body>
          )}
          {status.kind === 'failed' && <Body>{status.message}</Body>}
          {status.kind === 'saved' && !inPopup && target && (
            <Body>
              <a href={target}>Back to the page</a>
            </Body>
          )}
        </Card>
      </Page>
    </>
  )
}
