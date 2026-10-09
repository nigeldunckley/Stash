import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from '@phosphor-icons/react'
import { SettingsLayout } from '../../components/templates/SettingsLayout'
import { styled } from '../../components/tokens/stitches.config'
import { Button } from '../../components/templates/feeds/AddFeedPanel'
import { useGetApiKeysQuery } from '../../lib/networking/queries/useGetApiKeysQuery'
import { generateApiKeyMutation } from '../../lib/networking/mutations/generateApiKeyMutation'
import { revokeApiKeyMutation } from '../../lib/networking/mutations/revokeApiKeyMutation'
import { formattedShortDate } from '../../lib/dateFormatting'
import { showErrorToast } from '../../lib/toastHelpers'

// One place to set up saving from Safari's Share menu (an Apple Shortcut
// that calls /api/save with a save key) and the one-click Mac button.

const SAVE_KEY_NAME = 'Save to Stash'

const Wrap = styled('div', {
  width: '100%',
  maxWidth: '680px',
  margin: '0 auto',
  padding: '32px 20px 96px',
  boxSizing: 'border-box',
  display: 'grid',
  gap: '28px',
  fontFamily: '$inter',
  color: '$stInk',
})

const Title = styled('h1', {
  margin: 0,
  fontSize: '28px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
})

const Lede = styled('p', {
  margin: '8px 0 0',
  fontSize: '$body',
  lineHeight: 1.55,
  color: '$stMuted',
  maxWidth: '60ch',
})

const Section = styled('section', {
  display: 'grid',
  gap: '14px',
  padding: '20px',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$lg',
})

const SectionHead = styled('div', {
  display: 'flex',
  alignItems: 'baseline',
  gap: '10px',
  '& h2': { margin: 0, fontSize: '$body', fontWeight: 600 },
  '& span': {
    fontFamily: '$mono',
    fontSize: '$micro',
    color: '$stAccentText',
    letterSpacing: '0.04em',
  },
})

const Text = styled('p', {
  margin: 0,
  fontSize: '$small',
  lineHeight: 1.55,
  color: '$stInk2',
  '& b': { color: '$stInk', fontWeight: 600 },
})

const Steps = styled('ol', {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  counterReset: 'step',
  display: 'grid',
  gap: '14px',
  '& > li': {
    counterIncrement: 'step',
    display: 'grid',
    gridTemplateColumns: '22px minmax(0, 1fr)',
    gap: '10px',
    alignItems: 'start',
  },
  '& > li::before': {
    content: 'counter(step)',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    border: '1px solid $stLine',
    display: 'grid',
    placeItems: 'center',
    fontFamily: '$mono',
    fontSize: '$micro',
    color: '$stMuted',
  },
  '& > li > div': { display: 'grid', gap: '8px', minWidth: 0 },
})

const Fields = styled('dl', {
  margin: 0,
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr)',
  gap: '6px 12px',
  alignItems: 'center',
  fontSize: '$caption',
  '& dt': { color: '$stMuted' },
  '& dd': { margin: 0, minWidth: 0 },
})

const ValueBox = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  padding: '5px 6px 5px 10px',
  background: '$stSunken',
  border: '1px solid $stLine',
  borderRadius: '$sm',
  fontFamily: '$mono',
  fontSize: '$caption',
  color: '$stInk',
  '& code': {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    userSelect: 'all',
  },
})

const CopyButton = styled('button', {
  all: 'unset',
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 6px',
  borderRadius: '5px',
  fontFamily: '$inter',
  fontSize: '$micro',
  fontWeight: 500,
  color: '$stAccentText',
  cursor: 'pointer',
  '&:hover': { background: '$stAccentTint' },
  '&:focus-visible': { outline: '2px solid $stAccent' },
})

const Note = styled('p', {
  margin: 0,
  fontSize: '$caption',
  lineHeight: 1.5,
  color: '$stMuted',
})

const Row = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '10px',
})

const Bookmarklet = styled('a', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  height: '34px',
  padding: '0 14px',
  borderRadius: '$sm',
  background: '$stAccent',
  color: '$stOnAccent',
  fontSize: '$small',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'grab',
  '&:focus-visible': { outline: '2px solid $stInk', outlineOffset: '2px' },
})

const Kbd = styled('span', {
  fontFamily: '$mono',
  fontSize: '$micro',
  padding: '1px 5px',
  border: '1px solid $stLine',
  borderRadius: '4px',
  background: '$stSunken',
  whiteSpace: 'nowrap',
})

function CopyValue(props: { value: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLElement>(null)

  const copy = () => {
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    }
    navigator.clipboard?.writeText(props.value).then(done, () => {
      // Clipboard refused: select the text so Cmd-C works.
      const selection = window.getSelection()
      if (ref.current && selection) {
        selection.selectAllChildren(ref.current)
      }
    })
  }

  return (
    <ValueBox>
      <code ref={ref}>{props.value}</code>
      <CopyButton
        type="button"
        onClick={copy}
        aria-label={`Copy ${props.label}`}
      >
        {copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </CopyButton>
    </ValueBox>
  )
}

const bookmarkletFor = (origin: string): string =>
  `javascript:(function(){var u='${origin}/save?url='+encodeURIComponent(location.href);` +
  `var w=window.open(u,'stash-save','width=420,height=260');if(!w){location.href=u}})();`

export default function SaveFromSafari(): JSX.Element {
  const { apiKeys, revalidate } = useGetApiKeysQuery()
  const [origin, setOrigin] = useState('')
  const [newKey, setNewKey] = useState('')
  const [busy, setBusy] = useState(false)
  const bookmarkletRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  // React refuses javascript: links in JSX, so set it on the element.
  useEffect(() => {
    if (origin && bookmarkletRef.current) {
      bookmarkletRef.current.setAttribute('href', bookmarkletFor(origin))
    }
  }, [origin])

  const existing = apiKeys?.find((key) => key.name === SAVE_KEY_NAME)

  const createKey = async () => {
    setBusy(true)
    // Key names are unique, so a new save key replaces the old one.
    if (existing) {
      await revokeApiKeyMutation(existing.id)
    }
    const key = await generateApiKeyMutation({
      name: SAVE_KEY_NAME,
      expiresAt: new Date(8640000000000000),
    })
    setBusy(false)
    revalidate()
    if (key) {
      setNewKey(key)
    } else {
      showErrorToast("Couldn't create a save key. Try again.", {
        position: 'bottom-right',
      })
    }
  }

  const saveAddress = `${origin}/api/save`

  return (
    <SettingsLayout title="Save from Safari">
      <Wrap>
        <header>
          <Title>Save from Safari</Title>
          <Lede>
            Add <b>Save to Stash</b> to the Share menu on your Mac and iPhone.
            You set it up once on your Mac and iCloud copies it to your iPhone.
            It also works from any app with a Share button.
          </Lede>
        </header>

        <Section aria-labelledby="key-title">
          <SectionHead>
            <span>STEP 1</span>
            <h2 id="key-title">Create your save key</h2>
          </SectionHead>
          <Text>
            The key lets the Shortcut save to your account and nothing else uses
            it. Stash shows it only once, so keep this page open until the
            Shortcut is set up.
          </Text>
          {newKey ? (
            <CopyValue value={newKey} label="save key" />
          ) : existing ? (
            <Note>
              You made a save key on {formattedShortDate(existing.createdAt)}
              {existing.usedAt
                ? `, last used ${formattedShortDate(existing.usedAt)}`
                : ''}
              . If you need it again, create a new one. The old key stops
              working, so paste the new one into your Shortcut.
            </Note>
          ) : null}
          {!newKey && (
            <Row>
              <Button primary type="button" onClick={createKey} disabled={busy}>
                {busy
                  ? 'Creating…'
                  : existing
                  ? 'Create a new save key'
                  : 'Create save key'}
              </Button>
            </Row>
          )}
        </Section>

        <Section aria-labelledby="shortcut-title">
          <SectionHead>
            <span>STEP 2</span>
            <h2 id="shortcut-title">Add the Shortcut on your Mac</h2>
          </SectionHead>
          <Text>
            Open the <b>Shortcuts</b> app and follow these steps. It takes a
            couple of minutes, and you can copy each value from here.
          </Text>
          <Steps>
            <li>
              <div>
                <Text>
                  Choose <Kbd>File › New Shortcut</Kbd> and name it{' '}
                  <b>Save to Stash</b>.
                </Text>
              </div>
            </li>
            <li>
              <div>
                <Text>
                  Open the <b>Shortcut Details</b> panel (the <Kbd>ⓘ</Kbd>{' '}
                  button) and turn on <b>Show in Share Sheet</b>. Set it to
                  receive <b>URLs</b> and <b>Safari web pages</b>.
                </Text>
              </div>
            </li>
            <li>
              <div>
                <Text>
                  Add the <b>Get Contents of URL</b> action, set its address,
                  then click the arrow to show more and fill in the rest.
                </Text>
                <Fields>
                  <dt>Address</dt>
                  <dd>
                    <CopyValue value={saveAddress} label="address" />
                  </dd>
                  <dt>Method</dt>
                  <dd>
                    <Kbd>POST</Kbd>
                  </dd>
                  <dt>Header</dt>
                  <dd>
                    <Text>
                      Key <Kbd>Authorization</Kbd>, value your save key
                    </Text>
                  </dd>
                  <dt>Body</dt>
                  <dd>
                    <Text>
                      <Kbd>JSON</Kbd>, add a Text field with key <Kbd>url</Kbd>{' '}
                      and value <b>Shortcut Input</b>
                    </Text>
                  </dd>
                </Fields>
              </div>
            </li>
            <li>
              <div>
                <Text>
                  Add <b>Get Dictionary Value</b> and set it to get the value
                  for <Kbd>message</Kbd> in <b>Contents of URL</b>.
                </Text>
              </div>
            </li>
            <li>
              <div>
                <Text>
                  Add <b>Show Notification</b> and set its text to{' '}
                  <b>Dictionary Value</b>.
                </Text>
              </div>
            </li>
          </Steps>
          <Note>
            To test it, open any article in Safari, click Share, then Save to
            Stash. You should see &ldquo;Saved to Stash&rdquo;. On your iPhone
            it appears in the Share Sheet once iCloud has synced, which needs
            iCloud turned on for Shortcuts in Settings. If you don&apos;t see
            it, tap Edit Actions at the bottom of the Share Sheet.
          </Note>
        </Section>

        <Section aria-labelledby="button-title">
          <SectionHead>
            <span>OPTIONAL</span>
            <h2 id="button-title">One-click button for Safari on Mac</h2>
          </SectionHead>
          <Text>
            Show the Favourites bar with <Kbd>View › Show Favourites Bar</Kbd>,
            then drag this button onto it. Clicking it saves the page
            you&apos;re on.
          </Text>
          <Row>
            <Bookmarklet
              ref={bookmarkletRef}
              href="#"
              onClick={(event) => event.preventDefault()}
              title="Drag me to your Favourites bar"
            >
              Save to Stash
            </Bookmarklet>
            <Note>Drag it, don&apos;t click it.</Note>
          </Row>
        </Section>
      </Wrap>
    </SettingsLayout>
  )
}
