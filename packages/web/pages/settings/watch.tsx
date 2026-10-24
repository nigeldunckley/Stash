import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { SettingsLayout } from '../../components/templates/SettingsLayout'
import { styled } from '../../components/tokens/stitches.config'
import { Switch } from '../../components/elements/stash/Switch'
import { readHideShorts, updateHideShorts } from '../../lib/watch/collections'
import { showErrorToast } from '../../lib/toastHelpers'

// Watch: whether Shorts from the channels you follow show up.

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

const HIDE_SHORTS_KEY = ['watch-hide-shorts']

export default function WatchSettingsPage(): JSX.Element {
  const queryClient = useQueryClient()
  const { data: hideShorts } = useQuery({
    queryKey: HIDE_SHORTS_KEY,
    queryFn: readHideShorts,
  })
  const [saving, setSaving] = useState(false)

  const changeShorts = async (value: boolean) => {
    setSaving(true)
    queryClient.setQueryData(HIDE_SHORTS_KEY, value)
    try {
      await updateHideShorts(value)
      // Every Watch list, Home strip and count changes with it.
      await queryClient.invalidateQueries()
    } catch {
      queryClient.setQueryData(HIDE_SHORTS_KEY, !value)
      showErrorToast('Could not save that setting', {
        position: 'bottom-center',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout title="Watch">
      <Wrap>
        <header>
          <Title>Watch</Title>
          <Lede>
            How the videos from the YouTube channels you follow show up in
            Stash.
          </Lede>
        </header>

        <Section>
          <Row as="label" css={{ cursor: 'pointer' }}>
            <div>
              <h2>Hide Shorts</h2>
              <Text>
                Shorts from the channels you follow stay out of Watch, Home and
                their counts. Shorts you save yourself still show. A Short is a
                vertical video of three minutes or less.
              </Text>
            </div>
            <Switch
              label="Hide Shorts"
              checked={hideShorts ?? true}
              disabled={hideShorts === undefined || saving}
              onChange={changeShorts}
            />
          </Row>
        </Section>
      </Wrap>
    </SettingsLayout>
  )
}
