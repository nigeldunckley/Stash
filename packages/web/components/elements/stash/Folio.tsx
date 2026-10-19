import { useEffect, useMemo, useState } from 'react'
import { styled } from '../../tokens/stitches.config'
import { useGetSubscriptions } from '../../../lib/networking/subscriptions/useGetSubscriptions'
import { SubscriptionType } from '../../../lib/networking/queries/useGetSubscriptionsQuery'
import { isYouTubeFeedUrl } from '../../../lib/youtube'
import { shortTimeAgo } from '../../../lib/textFormatting'

// A newspaper folio above a page's title: the day, then a live fact or two
// about the page, in small mono caps over a fine double rule.

const Root = styled('div', {
  display: 'grid',
  gap: '10px',
  minWidth: 0,
  // The double rule: ink over a hairline.
  '&::after': {
    content: '""',
    height: '1px',
    borderTop: '1px solid $stInk',
    borderBottom: '1px solid $stLine',
  },
})

const Line = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minWidth: 0,
  fontFamily: '$mono',
  fontSize: '10.5px',
  fontWeight: 500,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  '& > [data-first]': { color: '$stInk' },
  '& > [data-sep]': { flex: 'none' },
  '& > [data-end]': { marginLeft: 'auto', paddingLeft: '16px' },
  '& [data-wide]': { '@smDown': { display: 'none' } },
  '& [data-narrow]': { display: 'none', '@smDown': { display: 'inline' } },
})

// Feeds checked in the last ten minutes get a small orange dot.
const Live = styled('span', {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: '$stAccent',
  flex: 'none',
})

export type FolioPart = {
  text: string
  // Left out on a phone, where the folio is one short line.
  wide?: boolean
}

export function Folio(props: {
  parts: (FolioPart | false | undefined)[]
  live?: boolean
  end?: string
}): JSX.Element {
  const now = useNow()
  const parts = props.parts.filter((part): part is FolioPart => !!part)
  return (
    <Root>
      <Line>
        <span data-first="">
          <span data-wide="">
            {now.toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
          <span data-narrow="">
            {now.toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </span>
        {parts.map((part, index) => (
          <FolioItem key={index} part={part} />
        ))}
        {props.live && <Live aria-label="Checked recently" />}
        {props.end && (
          <span data-end="" data-wide="">
            {props.end}
          </span>
        )}
      </Line>
    </Root>
  )
}

const FolioItem = (props: { part: FolioPart }): JSX.Element => (
  <>
    <span data-sep="" data-wide={props.part.wide ? '' : undefined}>
      ·
    </span>
    <span
      data-wide={props.part.wide ? '' : undefined}
      style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
    >
      {props.part.text}
    </span>
  </>
)

// The clock, ticking every 30 seconds so "checked 2 min ago" stays true.
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

// How many feeds (or channels) you follow, and when Stash last looked.
export function useFeedsFolio(kind: 'feeds' | 'channels'): {
  parts: FolioPart[]
  live: boolean
} {
  const now = useNow()
  const { data } = useGetSubscriptions({})
  return useMemo(() => {
    const feeds = (data ?? []).filter(
      (subscription) =>
        subscription.status == 'ACTIVE' &&
        subscription.type == SubscriptionType.RSS &&
        isYouTubeFeedUrl(subscription.url) == (kind == 'channels')
    )
    if (feeds.length == 0) return { parts: [], live: false }
    const checked = feeds
      .map((feed) => feed.lastFetchedAt)
      .filter((date): date is string => !!date)
      .sort()
      .pop()
    const noun =
      kind == 'channels'
        ? feeds.length == 1
          ? 'channel'
          : 'channels'
        : feeds.length == 1
        ? 'feed'
        : 'feeds'
    const parts: FolioPart[] = [{ text: `${feeds.length} ${noun}`, wide: true }]
    if (checked) {
      parts.push({
        text: `Checked ${shortTimeAgo(checked, now.getTime()).toLowerCase()}`,
      })
    }
    const live =
      !!checked && now.getTime() - new Date(checked).getTime() < 10 * 60_000
    return { parts, live }
  }, [data, kind, now])
}

// Days since Stash went live, 7 October 2026 being day 1.
export const stashDay = (now: Date): number =>
  Math.max(
    1,
    Math.floor(
      (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
        Date.UTC(2026, 9, 7)) /
        86_400_000
    ) + 1
  )
