import Link from 'next/link'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SettingsLayout } from '../../components/templates/SettingsLayout'
import { styled } from '../../components/tokens/stitches.config'
import { Switch } from '../../components/elements/stash/Switch'
import { showUndoToast, SiteIcon } from '../../components/elements/stash'
import { Button } from '../../components/templates/discover/discoverParts'
import {
  fallbackIconFor,
  iconFor,
} from '../../components/templates/discover/discoverText'
import {
  FEED_SUGGESTIONS_KEY,
  FeedSuggestion,
  isChannel,
  setFeedSuggestionsEnabled,
  useDismissedSuggestions,
  useFeedSuggestions,
  useSuggestionActions,
} from '../../lib/networking/feedSuggestions'
import { shortTimeAgo } from '../../lib/textFormatting'
import { showErrorToast } from '../../lib/toastHelpers'

// Suggested feeds: the switch for Discover and the Edition's suggestions.
// Turning it off forgets everything suggestions were built from.

const Wrap = styled('div', {
  width: '100%',
  maxWidth: '680px',
  margin: '0 auto',
  padding: '32px 20px 96px',
  boxSizing: 'border-box',
  display: 'grid',
  gap: '20px',
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
  minWidth: 0,
})

const ToggleRow = styled('label', {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '16px',
  cursor: 'pointer',
  '& > div': { flex: 1, display: 'grid', gap: '4px' },
  '& h2': { margin: 0, fontSize: '$body', fontWeight: 600 },
  '& > button, & > input': { marginTop: '2px' },
})

const Text = styled('p', {
  margin: 0,
  fontSize: '$small',
  lineHeight: 1.55,
  color: '$stInk2',
})

const Eyebrow = styled('span', {
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.04em',
  color: '$stMuted',
  textTransform: 'uppercase',
})

const Confirm = styled('div', {
  display: 'grid',
  gap: '12px',
  padding: '14px 16px',
  borderRadius: '$md',
  background: '$stAccentTint',
  border: '1px solid $stLine',
  '& p': { margin: 0, fontSize: '$small', lineHeight: 1.55 },
  '& div': { display: 'flex', flexWrap: 'wrap', gap: '8px' },
})

const Sources = styled('ol', {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  '& > li': {
    display: 'grid',
    gridTemplateColumns: '28px 1fr',
    gap: '2px 10px',
    padding: '12px 0',
    borderTop: '1px solid $stLine',
  },
  '& > li:first-child': { borderTop: 'none', paddingTop: 0 },
  '& > li > span': {
    gridRow: 'span 2',
    fontFamily: '$mono',
    fontSize: '$caption',
    color: '$stMuted',
    paddingTop: '1px',
  },
  '& b': { fontSize: '$small', fontWeight: 600 },
})

const Foot = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  paddingTop: '14px',
  borderTop: '1px solid $stLine',
  fontSize: '$small',
  color: '$stMuted',
  '& a': { color: '$stInk', fontWeight: 500 },
})

const Turned = styled('ul', {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  '& > li': {
    display: 'grid',
    gridTemplateColumns: '24px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 0',
    borderTop: '1px solid $stLine',
  },
  '& > li:first-child': { borderTop: 'none', paddingTop: 0 },
  '& > li:last-child': { paddingBottom: 0 },
  '& b': {
    display: 'block',
    fontSize: '$small',
    fontWeight: 600,
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

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Feeds you've said no to, each with a way to let it back in.
function TurnedDown(): JSX.Element {
  const { data, isPending } = useDismissedSuggestions()
  const actions = useSuggestionActions()
  const [shown, setShown] = useState(8)
  const items = data ?? []

  const restore = async (s: FeedSuggestion) => {
    try {
      const undo = await actions.restore(s)
      showUndoToast(`${s.title} can be suggested again`, undo)
    } catch {
      showErrorToast(`Could not bring back ${s.title}`)
    }
  }

  return (
    <Section aria-label="Not for you">
      <div style={{ display: 'grid', gap: 4 }}>
        <Eyebrow>Not for you</Eyebrow>
        <Text>
          {items.length
            ? 'Feeds you turned down, or let go after a trial. Stash never suggests them again unless you bring them back here.'
            : 'Turn a suggestion down with the × on Discover or in The Edition, and Stash will never suggest it again. It will be listed here in case you change your mind.'}
        </Text>
      </div>
      {isPending ? null : items.length > 0 ? (
        <>
          <Turned>
            {items.slice(0, shown).map((s) => (
              <li key={s.id}>
                <SiteIcon
                  src={iconFor(s)}
                  fallbackSrc={fallbackIconFor(s)}
                  name={s.title}
                  size={22}
                />
                <div style={{ minWidth: 0 }}>
                  <b>{s.title}</b>
                  <small>
                    {isChannel(s) ? 'YouTube channel' : hostOf(s.siteUrl)}
                  </small>
                </div>
                <Button
                  onClick={() => restore(s)}
                  css={{
                    height: '28px',
                    padding: '0 10px',
                    fontSize: '$caption',
                  }}
                >
                  Suggest again
                </Button>
              </li>
            ))}
          </Turned>
          {items.length > shown && (
            <Button
              tone="quiet"
              onClick={() => setShown(items.length)}
              css={{ justifySelf: 'start', padding: '0 4px' }}
            >
              Show all {items.length}
            </Button>
          )}
        </>
      ) : null}
    </Section>
  )
}

const SOURCES: [string, string][] = [
  [
    'Links in what you read',
    'Sites your feeds keep linking to, weighted by the pieces you finish and highlight.',
  ],
  ['Blogrolls', 'The sites your most-read feeds list in their blogrolls.'],
  [
    'Writers you keep finishing',
    'Their own sites, wherever else they publish.',
  ],
  [
    'Sites you save from',
    'Places you keep saving pieces from without following them.',
  ],
  [
    'YouTube channels',
    'Channels the pieces you read link to, for your Watch tab.',
  ],
  [
    'Starting points',
    'A few well-kept sites, only while your reading leads to fewer than three suggestions.',
  ],
]

export default function SuggestionSettings(): JSX.Element {
  const queryClient = useQueryClient()
  const { data, isPending } = useFeedSuggestions()
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const on = data?.enabled !== false

  const change = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setFeedSuggestionsEnabled(enabled)
      await queryClient.invalidateQueries({ queryKey: [FEED_SUGGESTIONS_KEY] })
      setConfirming(false)
      showUndoToast(
        enabled
          ? 'Suggestions are on. Stash is looking through your reading now.'
          : 'Suggestions are off, and everything they knew is forgotten.'
      )
    } catch {
      showErrorToast(
        enabled
          ? 'Could not turn suggestions on'
          : 'Could not turn suggestions off'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout title="Suggested feeds">
      <Wrap>
        <header>
          <Title>Suggested feeds</Title>
          <Lede>
            Each night Stash looks through what you read and suggests feeds
            worth following, on Discover and in The Edition.
          </Lede>
        </header>

        <Section>
          <ToggleRow>
            <div>
              <h2>Suggest feeds</h2>
              <Text>
                Nothing about your reading leaves your server. Stash only visits
                the sites your reading already points to.
              </Text>
            </div>
            <Switch
              label="Suggest feeds"
              checked={on && !confirming}
              disabled={isPending || saving}
              onChange={(checked) =>
                checked
                  ? confirming
                    ? setConfirming(false)
                    : change(true)
                  : setConfirming(true)
              }
            />
          </ToggleRow>
          {confirming && (
            <Confirm role="alert">
              <p>
                Turning suggestions off forgets every suggestion and trial, and
                what Stash has learned from your choices. Feeds you followed
                stay followed, and feeds you turned down stay turned down.
              </p>
              <div>
                <Button
                  tone="primary"
                  onClick={() => change(false)}
                  disabled={saving}
                >
                  {saving ? 'Turning off…' : 'Turn off and forget'}
                </Button>
                <Button onClick={() => setConfirming(false)}>
                  Keep suggestions
                </Button>
              </div>
            </Confirm>
          )}
        </Section>

        {on && (
          <Section>
            <Eyebrow>Where suggestions come from</Eyebrow>
            <Sources>
              {SOURCES.map(([name, note], i) => (
                <li key={name}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <b>{name}</b>
                  <Text>{note}</Text>
                </li>
              ))}
            </Sources>
            <Foot>
              <span>
                {data?.builtAt
                  ? `Last looked ${shortTimeAgo(
                      data.builtAt
                    ).toLowerCase()}, through ${
                      data.articlesConsidered
                    } articles`
                  : 'The first look runs tonight'}
              </span>
              <Link href="/l/discover">Open Discover</Link>
            </Foot>
          </Section>
        )}

        {on && !isPending && <TurnedDown />}
      </Wrap>
    </SettingsLayout>
  )
}
