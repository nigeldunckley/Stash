import { Compass } from '@phosphor-icons/react'
import Link from 'next/link'
import { useFeedSuggestions } from '../../../lib/networking/feedSuggestions'
import { SiteIcon } from '../../elements/stash'
import { motion, pressable } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import { fallbackIconFor, iconFor } from './discoverText'

// The way into Discover from Feeds. It sits apart from Read and Watch, on the
// right, and shows the faces of what's waiting.

const Root = styled(Link, {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  alignSelf: 'center',
  marginLeft: 'auto',
  height: '32px',
  padding: '0 12px 0 6px',
  borderRadius: '$round',
  border: '1px solid $stLine',
  background: '$stSurface',
  color: '$stInk',
  fontFamily: '$inter',
  fontSize: '$small',
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  transition: `border-color ${motion.fast}, transform ${motion.fast}`,
  '@media (hover: hover)': { '&:hover': { borderColor: '$stLineStrong' } },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  ...pressable,
})

const Faces = styled('span', {
  display: 'inline-flex',
  '& > * + *': { marginLeft: '-7px' },
  '& > *': { boxShadow: '0 0 0 2px $colors$stSurface' },
})

const New = styled('span', {
  fontFamily: '$mono',
  fontSize: '$micro',
  fontWeight: 500,
  color: '$stAccentText',
  fontVariantNumeric: 'tabular-nums',
  '@smDown': { display: 'none' },
})

export function DiscoverPill(): JSX.Element {
  const { data } = useFeedSuggestions()
  const fresh = (data?.suggestions ?? [])
    .filter((s) => s.status == 'NEW')
    .sort((a, b) => b.score - a.score)
  return (
    <Root href="/l/discover" aria-label="Discover new feeds">
      {fresh.length ? (
        <Faces aria-hidden="true">
          {fresh.slice(0, 3).map((s) => (
            <SiteIcon
              key={s.id}
              src={iconFor(s)}
              fallbackSrc={fallbackIconFor(s)}
              name={s.title}
              size={22}
              round
            />
          ))}
        </Faces>
      ) : (
        <Compass size={18} style={{ marginLeft: 4 }} />
      )}
      Discover
      {fresh.length > 0 && <New>{fresh.length} new</New>}
    </Root>
  )
}
