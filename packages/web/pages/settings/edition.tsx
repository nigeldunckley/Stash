import { useState } from 'react'
import { SettingsLayout } from '../../components/templates/SettingsLayout'
import { styled } from '../../components/tokens/stitches.config'
import { Switch } from '../../components/elements/stash/Switch'
import { SegmentedControl } from '../../components/elements/stash'
import { useEditionState, useUpdateEdition } from '../../lib/edition/useEdition'
import { EditionSettings } from '../../lib/edition/store'
import {
  dayName,
  hourLabel,
  issueIsOut,
  nextIssueAt,
} from '../../lib/edition/weekly'
import { showErrorToast } from '../../lib/toastHelpers'

// The Edition: when the weekly issue comes out, whether Home points to it,
// and how many saves Home's Up next shows.

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
  padding: '4px 20px',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$lg',
  minWidth: 0,
})

const Row = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '16px 0',
  borderTop: '1px solid $stLine',
  '&:first-child': { borderTop: 'none' },
  '& > div:first-child': { flex: 1, display: 'grid', gap: '4px', minWidth: 0 },
  h2: { margin: 0, fontSize: '$body', fontWeight: 600 },
  '@smDown': {
    flexWrap: 'wrap',
    '& > div:first-child': { flexBasis: '100%' },
  },
})

const Text = styled('p', {
  margin: 0,
  fontSize: '$small',
  lineHeight: 1.55,
  color: '$stInk2',
})

const Controls = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
})

const Select = styled('select', {
  height: '30px',
  padding: '0 26px 0 10px',
  fontFamily: '$mono',
  fontSize: '$caption',
  color: '$stInk',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$sm',
  cursor: 'pointer',
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
})

const Note = styled('p', {
  margin: 0,
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '$stMuted',
})

const HOURS = [5, 6, 7, 8, 9, 10, 11, 12]

export default function EditionSettingsPage(): JSX.Element {
  const { data: state } = useEditionState()
  const update = useUpdateEdition()
  const [saving, setSaving] = useState(false)

  const change = async (next: Partial<EditionSettings>) => {
    setSaving(true)
    try {
      await update(() => next)
    } catch {
      showErrorToast('Could not save that setting', {
        position: 'bottom-center',
      })
    } finally {
      setSaving(false)
    }
  }

  const now = new Date()
  const status = state ? issueIsOut(now, state, state.read) : undefined
  const next = state ? nextIssueAt(now, state) : undefined

  return (
    <SettingsLayout title="The Edition">
      <Wrap>
        <header>
          <Title>The Edition</Title>
          <Lede>
            A weekly issue of the best stories you missed, old saves worth
            another look, your highlights and someone new to read. It shows in
            the sidebar while it&apos;s out and leaves when you mark it read.
          </Lede>
        </header>

        <Section>
          <Row>
            <div>
              <h2>Comes out</h2>
              <Text>
                It stays out until the end of Sunday, or until you mark it read.
              </Text>
            </div>
            <Controls>
              <SegmentedControl
                label="Day"
                value={String(state?.day ?? 6)}
                onChange={(day) => change({ day: Number(day) })}
                options={[6, 0].map((day) => ({
                  value: String(day),
                  label: dayName(day),
                }))}
              />
              <Select
                aria-label="Hour"
                value={state?.hour ?? 7}
                disabled={!state || saving}
                onChange={(event) =>
                  change({ hour: Number(event.target.value) })
                }
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </Select>
            </Controls>
          </Row>
          <Row as="label" css={{ cursor: 'pointer' }}>
            <div>
              <h2>Show on Home when it arrives</h2>
              <Text>
                A strip at the top of Home points to the new issue until you
                open it.
              </Text>
            </div>
            <Switch
              label="Show on Home when it arrives"
              checked={state?.showOnHome ?? true}
              disabled={!state || saving}
              onChange={(showOnHome) => change({ showOnHome })}
            />
          </Row>
          <Row>
            <div>
              <h2>Up next on Home</h2>
              <Text>
                How many of your saves Home shows, starting with anything
                you&apos;ve begun.
              </Text>
            </div>
            <SegmentedControl
              label="Up next on Home"
              value={String(state?.upNext ?? 5)}
              onChange={(count) => change({ upNext: Number(count) })}
              options={['3', '4', '5'].map((count) => ({
                value: count,
                label: count,
              }))}
            />
          </Row>
        </Section>

        {status && next && (
          <Note>
            {status.out
              ? 'This week’s issue is out now'
              : `Next issue ${next.toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })} at ${hourLabel(state?.hour ?? 7)}`}
          </Note>
        )}
      </Wrap>
    </SettingsLayout>
  )
}
