import { ArrowSquareOut, Check } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { localDate, trialDays } from '../../../lib/edition/discovery'
import {
  FEED_SUGGESTIONS_KEY,
  FeedSuggestion,
  updateFeedSuggestion,
  useSuggestionActions,
} from '../../../lib/networking/feedSuggestions'
import { useGetLibraryItems } from '../../../lib/networking/library_items/useLibraryItems'
import { searchValue } from '../../../lib/networking/subscriptions/feeds'
import { formatMinutes } from '../../../lib/readingTime'
import { showErrorToast } from '../../../lib/toastHelpers'
import { SiteIcon, showUndoToast } from '../../elements/stash'
import { styled } from '../../tokens/stitches.config'
import { Button, Chip, Label } from '../discover/discoverParts'
import {
  fallbackIconFor,
  iconFor,
  isGuide,
  whyLine,
} from '../discover/discoverText'
import { Actions, Btn } from './editionStyles'

// Discover's pieces of The Edition: "Someone new" in each issue, and the
// verdict when a trial's week is up. Stories here are on sites you don't
// follow, so they open on the site.

const minutes = (n?: number) => (n ? formatMinutes(n) : undefined)

// Try, dismiss, keep and drop with the same undo toasts as Discover.
function useActs() {
  const actions = useSuggestionActions()
  const queryClient = useQueryClient()

  const tryIt = useCallback(
    async (s: FeedSuggestion) => {
      const undo = await actions.tryForAWeek(s)
      if (!undo) return showErrorToast(`Could not add ${s.title}`)
      showUndoToast(`Trying ${s.title} for a week`, undo)
    },
    [actions]
  )
  const dismiss = useCallback(
    async (s: FeedSuggestion) => {
      const undo = await actions.dismiss(s)
      showUndoToast(`Won't suggest ${s.title} again`, undo)
    },
    [actions]
  )
  const keep = useCallback(
    async (s: FeedSuggestion) => {
      try {
        await updateFeedSuggestion(s.id, 'KEEP')
        showUndoToast(`Keeping ${s.title}`)
      } catch {
        showErrorToast(`Could not keep ${s.title}`)
      }
      await queryClient.invalidateQueries({ queryKey: [FEED_SUGGESTIONS_KEY] })
    },
    [queryClient]
  )
  const drop = useCallback(
    async (s: FeedSuggestion) => {
      const undo = await actions.drop(s)
      showUndoToast(`Let ${s.title} go`, undo)
    },
    [actions]
  )
  return { tryIt, dismiss, keep, drop }
}

const statusChip = (s: FeedSuggestion) => (
  <Chip accent css={{ height: '32px', padding: '0 12px' }}>
    <Check size={12} weight="bold" style={{ marginRight: 5 }} />
    {s.status == 'TRIAL' ? 'Trying this week' : 'Following'}
  </Chip>
)

// ---------------------------------------------------------------------------
// Someone new

const NewBand = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '28px',
  padding: '22px 24px',
  borderRadius: '$lg',
  background: '$stSunken',
  '@mdDown': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '22px',
    padding: '16px',
  },
})

const Newcomer = styled('article', {
  display: 'grid',
  gap: '10px',
  alignContent: 'start',
  minWidth: 0,
})

const Who = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minWidth: 0,
  b: {
    fontSize: '$body',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})

const Why = styled('p', {
  margin: 0,
  fontSize: '$small',
  lineHeight: 1.45,
  color: '$stMuted',
})

const NewTitle = styled('a', {
  fontFamily: '$serif',
  fontSize: '21px',
  fontWeight: 500,
  lineHeight: 1.22,
  color: '$stInk',
  textDecoration: 'none',
  textWrap: 'balance',
  '@media (hover: hover)': {
    '&:hover': { textDecoration: 'underline', textDecorationThickness: '1px' },
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

// Two writers or sites you don't follow yet, chosen by Discover from your
// own reading. Their stories open on their site.
export function SomeoneNew(props: {
  suggestions: FeedSuggestion[]
}): JSX.Element {
  const acts = useActs()
  return (
    <NewBand>
      {props.suggestions.map((s) => {
        const post = s.latest[0]
        return (
          <Newcomer key={s.id} aria-label={s.title}>
            <Who>
              <SiteIcon
                src={iconFor(s)}
                fallbackSrc={fallbackIconFor(s)}
                name={s.title}
                size={28}
              />
              <b>{s.title}</b>
            </Who>
            <Why>{whyLine(s)}</Why>
            {post && (
              <NewTitle href={post.url} target="_blank" rel="noreferrer">
                {post.title}
              </NewTitle>
            )}
            <Actions css={{ marginTop: '4px' }}>
              {post && (
                <Btn
                  primary
                  as="a"
                  href={post.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read a sample
                  {minutes(post.minutes) ? ` · ${minutes(post.minutes)}` : ''}
                  <ArrowSquareOut size={13} />
                </Btn>
              )}
              {s.status == 'NEW' ? (
                <>
                  <Btn type="button" onClick={() => acts.tryIt(s)}>
                    Follow for a week
                  </Btn>
                  <Button tone="quiet" onClick={() => acts.dismiss(s)}>
                    Not for me
                  </Button>
                </>
              ) : (
                statusChip(s)
              )}
            </Actions>
          </Newcomer>
        )
      })}
    </NewBand>
  )
}

// ---------------------------------------------------------------------------
// Trial verdict

export const Verdicts = styled('div', { display: 'grid', gap: '14px' })

const Verdict = styled('article', {
  display: 'grid',
  gap: '12px',
  padding: '16px',
  borderRadius: '$lg',
  border: '1px solid $stLine',
  background: '$stSurface',
})

const Week = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: '4px',
  '& > div': {
    display: 'grid',
    justifyItems: 'center',
    gap: '4px',
    fontFamily: '$mono',
    fontSize: '9.5px',
    color: '$stMuted',
  },
  i: {
    width: '100%',
    height: '30px',
    borderRadius: '4px',
    background: '$stSunken',
    border: '1px solid $stLine',
  },
  'i[data-day="read"]': {
    background: '$stAccent',
    borderColor: '$stAccent',
  },
  'i[data-day="posted"]': {
    background: '$stAccentTint',
    borderColor: 'color-mix(in srgb, $colors$stAccent 35%, transparent)',
  },
})

const VerdictLine = styled('p', {
  margin: 0,
  fontFamily: '$serif',
  fontSize: '18px',
  lineHeight: 1.3,
  color: '$stInk',
})

export function TrialVerdict(props: { s: FeedSuggestion }): JSX.Element {
  const { s } = props
  const acts = useActs()
  const [answered, setAnswered] = useState(false)
  const { data } = useGetLibraryItems(
    `trial-${s.id}`,
    undefined,
    {
      limit: 40,
      sortDescending: true,
      searchQuery: s.feedUrl ? `subscription:${searchValue(s.feedUrl)}` : '',
    },
    !!s.feedUrl
  )
  const days = useMemo(() => trialDays(s.trialEndsAt as string), [s])
  const week = useMemo(() => {
    const items = (data?.pages ?? []).flatMap((page) =>
      page.edges.map((edge) => edge.node)
    )
    return days.map((day) => {
      const that = items.filter(
        (item) =>
          localDate(new Date(item.publishedAt ?? item.savedAt ?? 0)) == day
      )
      const read = that.filter(
        (item) => (item.readingProgressPercent ?? 0) >= 2
      ).length
      return { day, posted: that.length, read }
    })
  }, [data, days])
  const posted = week.reduce((sum, d) => sum + d.posted, 0)
  const read = week.reduce((sum, d) => sum + d.read, 0)
  const ended = new Date(s.trialEndsAt as string)
  const today = localDate(new Date()) == localDate(ended)
  const via = s.reasons.find(isGuide)

  return (
    <Verdict aria-label={`Trial of ${s.title}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Label css={{ color: '$stAccentText' }}>
          {today
            ? 'Your trial ends today'
            : `Your trial ended ${ended.toLocaleDateString(undefined, {
                weekday: 'long',
              })}`}
        </Label>
        <Label>7 days</Label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SiteIcon
          src={iconFor(s)}
          fallbackSrc={fallbackIconFor(s)}
          name={s.title}
          size={28}
        />
        <div style={{ minWidth: 0 }}>
          <b style={{ fontWeight: 600 }}>{s.title}</b>
          {via && (
            <Label as="div" css={{ textTransform: 'none' }}>
              via {via.guideName}
            </Label>
          )}
        </div>
      </div>
      <Week aria-label={`It posted ${posted} times and you read ${read}`}>
        {week.map((d) => (
          <div key={d.day}>
            <i
              data-day={d.read ? 'read' : d.posted ? 'posted' : undefined}
              title={`${d.posted} posted · ${d.read} read`}
            />
            {new Date(`${d.day}T12:00:00`)
              .toLocaleDateString(undefined, { weekday: 'narrow' })
              .toUpperCase()}
          </div>
        ))}
      </Week>
      <VerdictLine>
        {posted == 0
          ? `It didn't post this week, so there was nothing to read yet.`
          : `It posted ${posted} ${
              posted == 1 ? 'time' : 'times'
            } and you read ${read == 0 ? 'none' : read}.`}
      </VerdictLine>
      {answered ? null : (
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn
            primary
            type="button"
            onClick={() => {
              setAnswered(true)
              acts.keep(s)
            }}
          >
            Keep it
          </Btn>
          <Btn
            type="button"
            onClick={() => {
              setAnswered(true)
              acts.drop(s)
            }}
          >
            Let it go
          </Btn>
        </div>
      )}
    </Verdict>
  )
}
