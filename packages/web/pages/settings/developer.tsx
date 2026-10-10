import dayjs from 'dayjs'
import { ArrowClockwise } from '@phosphor-icons/react'
import { SettingsLayout } from '../../components/templates/SettingsLayout'
import { styled } from '../../components/tokens/stitches.config'
import { Button } from '../../components/templates/feeds/AddFeedPanel'
import { Switch } from '../../components/elements/stash/Switch'
import { useDeveloperMode } from '../../lib/hooks/useDeveloperMode'
import { useServerVersion } from '../../lib/networking/useServerVersion'
import {
  BuildInfo,
  STASH_REPO_URL,
  UpdateNote,
  describeCommit,
  lastServerUpdate,
  updatedAgo,
} from '../../lib/serverVersion'

// Developer mode: shows which merge the server is running and when it last
// updated, so it's clear when a merged pull request has gone live.

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
  '& > button': { marginTop: '2px' },
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

const Headline = styled('p', {
  margin: 0,
  fontFamily: '$display',
  fontSize: '26px',
  fontWeight: 600,
  letterSpacing: '-0.02em',
  lineHeight: 1.15,
})

const Mono = styled('p', {
  margin: 0,
  fontFamily: '$mono',
  fontSize: '$caption',
  lineHeight: 1.5,
  color: '$stMuted',
  overflowWrap: 'anywhere',
})

const Check = styled('p', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  margin: 0,
  paddingTop: '14px',
  borderTop: '1px solid $stLine',
  fontSize: '$small',
  color: '$stInk2',
  '& i': {
    flex: 'none',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '$stInk2',
  },
  variants: {
    failed: {
      true: { color: '$stAccentText', '& i': { background: '$stAccent' } },
    },
  },
})

const List = styled('ul', {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  '& > li': {
    display: 'grid',
    gap: '4px',
    padding: '14px 0',
    borderTop: '1px solid $stLine',
    minWidth: 0,
  },
  '& > li:first-of-type': { paddingTop: 0, borderTop: 'none' },
  '& > li:last-of-type': { paddingBottom: 0 },
})

const Change = styled('p', {
  margin: 0,
  fontSize: '$body',
  fontWeight: 500,
  lineHeight: 1.4,
  '& a': {
    fontFamily: '$mono',
    fontSize: '$small',
    fontWeight: 500,
    color: '$stAccentText',
    textDecoration: 'none',
    marginRight: '6px',
  },
  '& a:hover': { textDecoration: 'underline' },
})

const Note = styled('p', {
  margin: 0,
  fontSize: '$caption',
  lineHeight: 1.5,
  color: '$stMuted',
  '& code': { fontFamily: '$mono' },
})

const Footer = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '12px',
  '& svg': { marginRight: '6px' },
})

const when = (date: string | undefined): string =>
  date ? dayjs(date).format('ddd D MMM, HH:mm') : ''

const CHECK_RESULTS: Record<string, string> = {
  'up-to-date': 'Up to date',
  updated: 'Installed a new version',
  failed: 'The last check failed',
}

const UPDATE_KINDS: Record<string, string> = {
  images: 'New app version',
  full: 'Full update',
}

function CommitLine(props: {
  commit?: { subject?: string; body?: string; commit?: string } | null
}): JSX.Element {
  const { pr, title } = describeCommit(props.commit)
  const sha = props.commit?.commit
  return (
    <Change>
      {pr ? (
        <a
          href={`${STASH_REPO_URL}/pull/${pr}`}
          target="_blank"
          rel="noreferrer"
        >
          #{pr}
        </a>
      ) : sha ? (
        <a
          href={`${STASH_REPO_URL}/commit/${sha}`}
          target="_blank"
          rel="noreferrer"
        >
          {sha.slice(0, 7)}
        </a>
      ) : null}
      {title ?? 'Not reported'}
    </Change>
  )
}

function BuildItem(props: {
  label: string
  build: BuildInfo | null | undefined
  missing: string
}): JSX.Element {
  const { build } = props
  const details = build?.commit
    ? [
        build.commit.slice(0, 7),
        build.committedAt && `merged ${when(build.committedAt)}`,
        build.startedAt && `live since ${when(build.startedAt)}`,
      ]
    : [build?.startedAt && `live since ${when(build.startedAt)}`]
  return (
    <li>
      <Eyebrow>{props.label}</Eyebrow>
      {build?.commit ? (
        <CommitLine commit={build} />
      ) : (
        <Change>{props.missing}</Change>
      )}
      <Mono>{details.filter(Boolean).join(' · ')}</Mono>
    </li>
  )
}

function ServerStatus(): JSX.Element {
  const { data, isError, isFetching, refetch, dataUpdatedAt } =
    useServerVersion(true)
  const updated = lastServerUpdate(data)
  const check: UpdateNote | null | undefined = data?.lastCheck

  if (isError && !data) {
    return (
      <Section>
        <Eyebrow>Server</Eyebrow>
        <Text>
          Stash couldn&apos;t reach the server to check its version. Try again
          in a moment.
        </Text>
        <Footer>
          <Button type="button" onClick={() => refetch()}>
            <ArrowClockwise size={14} />
            Try again
          </Button>
        </Footer>
      </Section>
    )
  }

  return (
    <>
      <Section aria-labelledby="updated-title" aria-busy={!data}>
        <Eyebrow>Server</Eyebrow>
        <Headline id="updated-title">
          {updated ? `Updated ${updatedAgo(updated)}` : 'Checking…'}
        </Headline>
        {updated && (
          <Mono>
            {when(updated)}
            {data?.lastUpdate &&
              ` · ${UPDATE_KINDS[data.lastUpdate.result] ?? 'Update'}`}
          </Mono>
        )}
        {data?.lastUpdate && <CommitLine commit={data.lastUpdate} />}
        {data && (
          <Check failed={check?.result == 'failed'}>
            <i />
            {check
              ? `Checked for updates ${updatedAgo(check.at)} · ${
                  CHECK_RESULTS[check.result] ?? check.result
                }`
              : 'Automatic updates haven’t reported in yet'}
          </Check>
        )}
        {check?.result == 'failed' && (
          <Note>
            See what went wrong on the server with{' '}
            <code>journalctl -u stash-update</code>.
          </Note>
        )}
      </Section>

      {data && (
        <Section aria-label="Running now">
          <List>
            <BuildItem
              label="Web app"
              build={data.web}
              missing="Built before version reporting"
            />
            <BuildItem
              label="API"
              build={data.api}
              missing="Built before version reporting"
            />
            {check && (
              <li>
                <Eyebrow>Latest merge on the server</Eyebrow>
                <CommitLine commit={check} />
                <Mono>
                  {[
                    check.commit?.slice(0, 7),
                    check.committedAt && `merged ${when(check.committedAt)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Mono>
              </li>
            )}
          </List>
        </Section>
      )}

      <Note>
        A merge reaches the server once GitHub has built it and the next update
        check picks it up, usually within 15 minutes. The web app and API only
        change when a merge touches them, so the latest merge can be newer than
        both.
      </Note>
      <Footer>
        <Button type="button" onClick={() => refetch()} disabled={isFetching}>
          <ArrowClockwise size={14} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </Button>
        {dataUpdatedAt > 0 && (
          <Note>Shown {dayjs(dataUpdatedAt).format('HH:mm:ss')}</Note>
        )}
      </Footer>
    </>
  )
}

export default function DeveloperSettings(): JSX.Element {
  const [developerMode, setDeveloperMode] = useDeveloperMode()
  return (
    <SettingsLayout title="Developer">
      <Wrap>
        <header>
          <Title>Developer</Title>
          <Lede>
            See which version of Stash your server is running, and when it last
            updated.
          </Lede>
        </header>

        <Section>
          <ToggleRow>
            <div>
              <h2>Developer mode</h2>
              <Text>
                Shows the server&apos;s version here and when it last updated at
                the bottom of the sidebar. Only on this device.
              </Text>
            </div>
            <Switch
              label="Developer mode"
              checked={developerMode}
              onChange={setDeveloperMode}
            />
          </ToggleRow>
        </Section>

        {developerMode && <ServerStatus />}
      </Wrap>
    </SettingsLayout>
  )
}
