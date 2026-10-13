import { ArrowSquareOut, Check, Plus, X } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import {
  DiscoveryIssue,
  issueNumber,
  localDate,
  trialDays,
} from '../../../lib/edition/discovery'
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
import { CoverImage, SiteIcon, showUndoToast } from '../../elements/stash'
import { styled } from '../../tokens/stitches.config'
import {
  Button,
  Chain,
  Chip,
  Label,
  NotForMe,
  Pill,
  Tile,
} from '../discover/discoverParts'
import {
  fallbackIconFor,
  iconFor,
  isGuide,
  matchPercent,
  reasonLine,
  whyLine,
} from '../discover/discoverText'
import {
  Actions,
  Brief,
  BriefEnd,
  BriefRow,
  BriefTitle,
  Btn,
  Colophon,
  Dek,
  Lead,
  LeadCopy,
  LeadTitle,
  LongDate,
  Mast,
  MastDate,
  MastSub,
  MastTitle,
  MastTop,
  Meta,
  Picks,
  SectionHead,
  ShortDate,
  Source,
  Story,
  StoryDek,
  StoryFoot,
  StoryTitle,
  Ticks,
} from './editionStyles'

// Discover's pieces of The Edition: the daily "Recommended for you", The
// Discovery Edition on Saturdays, and the verdict when a trial's week is up.
// Stories here are on sites you don't follow, so they open on the site.

const minutes = (n?: number) => (n ? formatMinutes(n) : undefined)

const picture = (s: FeedSuggestion, letterSize = 64) => {
  const image = s.latest[0]?.image
  const tile = (
    <Tile style={{ width: '100%', height: '100%' }}>
      <span style={{ fontSize: letterSize }}>{s.title.charAt(0)}</span>
    </Tile>
  )
  return { image, tile }
}

function siteSource(s: FeedSuggestion, label?: string): JSX.Element {
  return (
    <Source>
      <SiteIcon
        src={iconFor(s)}
        fallbackSrc={fallbackIconFor(s)}
        name={s.title}
        size={14}
      />
      <span>{s.title}</span>
      <b>· {label ?? whyLine(s)}</b>
    </Source>
  )
}

// Follow, try and dismiss with the same undo toasts as Discover.
function useActs() {
  const actions = useSuggestionActions()
  const queryClient = useQueryClient()

  const follow = useCallback(
    async (s: FeedSuggestion) => {
      const undo = await actions.follow(s)
      if (!undo) return showErrorToast(`Could not follow ${s.title}`)
      showUndoToast(`Following ${s.title}`, undo)
    },
    [actions]
  )
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
  return { follow, tryIt, dismiss, keep, drop }
}

const statusChip = (s: FeedSuggestion) => (
  <Chip accent css={{ height: '32px', padding: '0 12px' }}>
    <Check size={12} weight="bold" style={{ marginRight: 5 }} />
    {s.status == 'TRIAL' ? 'Trying this week' : 'Following'}
  </Chip>
)

// ---------------------------------------------------------------------------
// Recommended for you

const Band = styled('section', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
  gap: '26px',
  alignItems: 'center',
  padding: '20px',
  borderRadius: '$lg',
  background: '$stAccentTint',
  border: '1px solid color-mix(in srgb, $colors$stAccent 30%, transparent)',
  '@mdDown': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '14px',
    padding: '14px',
  },
})

const BandCover = styled('a', {
  display: 'block',
  aspectRatio: '16 / 10',
  borderRadius: '$sm',
  overflow: 'hidden',
  '& > *': { width: '100%', height: '100%' },
})

const BandHead = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '10px',
  h2: {
    margin: 0,
    fontSize: '$caption',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '$stAccentText',
  },
})

const BandTitle = styled('a', {
  fontFamily: '$serif',
  fontSize: '30px',
  fontWeight: 400,
  lineHeight: 1.1,
  color: '$stInk',
  textDecoration: 'none',
  textWrap: 'balance',
  '@media (hover: hover)': {
    '&:hover': { textDecoration: 'underline', textDecorationThickness: '1px' },
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '@mdDown': { fontSize: '24px' },
})

const Copy = styled('div', { display: 'grid', gap: '12px', minWidth: 0 })

export function RecommendedBand(props: {
  suggestion: FeedSuggestion
}): JSX.Element {
  const s = props.suggestion
  const acts = useActs()
  const post = s.latest[0]
  const { image, tile } = picture(s)
  return (
    <Band aria-label="Recommended for you">
      <BandCover
        href={post.url}
        target="_blank"
        rel="noreferrer"
        tabIndex={-1}
        aria-hidden="true"
      >
        {image ? <CoverImage src={image} fallback={tile} /> : tile}
      </BandCover>
      <Copy>
        <BandHead>
          <h2>Recommended for you</h2>
          <Label>Today&apos;s discovery</Label>
        </BandHead>
        <Chain reasons={s.reasons}>
          <Pill
            name={s.title}
            icon={iconFor(s)}
            fallbackIcon={fallbackIconFor(s)}
            suggested
          />
        </Chain>
        <BandTitle href={post.url} target="_blank" rel="noreferrer">
          {post.title}
        </BandTitle>
        {(post.summary || s.description) && (
          <Dek css={{ fontSize: '16px' }}>{post.summary || s.description}</Dek>
        )}
        <Label css={{ textTransform: 'none', color: '$stAccentText' }}>
          {s.reasons.map(reasonLine).slice(0, 2).join(' · ')}
        </Label>
        <Actions>
          <Btn primary as="a" href={post.url} target="_blank" rel="noreferrer">
            Read{minutes(post.minutes) ? ` · ${minutes(post.minutes)}` : ''}
            <ArrowSquareOut size={13} />
          </Btn>
          {s.status == 'NEW' ? (
            <>
              <Button tone="accent" onClick={() => acts.tryIt(s)}>
                Try for a week
              </Button>
              <Button tone="quiet" onClick={() => acts.dismiss(s)}>
                Not for me
              </Button>
            </>
          ) : (
            statusChip(s)
          )}
        </Actions>
      </Copy>
    </Band>
  )
}

// ---------------------------------------------------------------------------
// The Discovery Edition

const Issue = styled('section', {
  display: 'grid',
  gap: '32px',
  // A clear break from the day's edition above it.
  marginTop: '48px',
  '@mdDown': { gap: '26px' },
})

const Title = styled(MastTitle, {
  '@mdDown': { whiteSpace: 'normal', fontSize: '30px' },
})

const Cover = styled('a', {
  display: 'block',
  borderRadius: '$sm',
  overflow: 'hidden',
  '& > *': { width: '100%', height: '100%' },
})

const FollowPill = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  height: '26px',
  padding: '0 10px',
  borderRadius: '$round',
  border: '1px solid $stLineStrong',
  fontSize: '$caption',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  '&[aria-pressed="true"]': {
    background: '$stInk',
    color: '$stSurface',
    borderColor: '$stInk',
    cursor: 'default',
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

const Tally = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '12px',
  '& > div': { display: 'grid', gap: '4px' },
  b: {
    fontFamily: '$serif',
    fontWeight: 400,
    fontSize: '34px',
    lineHeight: 1,
  },
})

const Lower = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
  gap: '40px',
  '@mdDown': { gridTemplateColumns: 'minmax(0, 1fr)', gap: '28px' },
})

// Follow, with a quiet way to turn the suggestion down beside it.
function FollowToggle(props: {
  s: FeedSuggestion
  onFollow: (s: FeedSuggestion) => void
  onDismiss: (s: FeedSuggestion) => void
}): JSX.Element {
  const done = props.s.status != 'NEW'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {!done && (
        <NotForMe
          type="button"
          aria-label={`Not for me: don't suggest ${props.s.title} again`}
          title="Not for me"
          onClick={() => props.onDismiss(props.s)}
        >
          <X size={12} weight="bold" />
        </NotForMe>
      )}
      <FollowPill
        type="button"
        aria-pressed={done}
        aria-label={
          done ? `Following ${props.s.title}` : `Follow ${props.s.title}`
        }
        onClick={() => !done && props.onFollow(props.s)}
      >
        {done ? <Check size={12} weight="bold" /> : <Plus size={12} />}
        {done ? (props.s.status == 'TRIAL' ? 'Trying' : 'Following') : 'Follow'}
      </FollowPill>
    </span>
  )
}

const longDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`

export function DiscoveryEdition(props: {
  date: string
  hour: number
  issue: DiscoveryIssue
  articles: number
  feeds: number
  following: number
  trying: FeedSuggestion[]
}): JSX.Element {
  const { issue } = props
  const acts = useActs()
  const lead = issue.lead
  const post = lead.latest[0]
  const all = [lead, ...issue.picks, ...issue.writers]
  const acted = all.filter((s) => s.status != 'NEW').length
  const total = all.reduce((sum, s) => sum + (s.latest[0]?.minutes ?? 4), 0)
  const { image, tile } = picture(lead, 120)
  const nextEnd = props.trying
    .map((s) => s.trialEndsAt)
    .filter((d): d is string => !!d)
    .sort()[0]

  return (
    <Issue aria-label="The Discovery Edition" id="discovery-edition">
      <Mast>
        <MastTop>
          <Title as="h2">
            The Discovery Edition<em>.</em>
          </Title>
          <MastDate css={{ whiteSpace: 'nowrap' }}>
            <span>
              <LongDate>{longDate(props.date)}</LongDate>
              <ShortDate>{shortDate(props.date)}</ShortDate>
              <br />
              No. {issueNumber(props.date)}
              <LongDate> · made at {hourLabel(props.hour)}</LongDate>
            </span>
          </MastDate>
        </MastTop>
        <MastSub>
          <span>
            {props.articles > 0 && `From ${props.articles} articles you read, `}
            {props.articles > 0 ? props.feeds : 'Here are ' + props.feeds}{' '}
            {props.feeds == 1 ? 'feed' : 'feeds'} worth meeting, picked down to{' '}
            {all.length} {all.length == 1 ? 'story' : 'stories'}. About{' '}
            {formatMinutes(total)} of reading.
          </span>
          <Ticks aria-label={`${acted} of ${all.length} followed or tried`}>
            <span>
              {all.map((s, i) => (
                <i key={s.id} data-done={i < acted} />
              ))}
            </span>
            {acted} OF {all.length}
          </Ticks>
        </MastSub>
      </Mast>

      <Lead>
        <Cover
          href={post.url}
          target="_blank"
          rel="noreferrer"
          tabIndex={-1}
          aria-hidden="true"
          css={{ aspectRatio: '4 / 3', '@mdDown': { aspectRatio: '3 / 2' } }}
        >
          {image ? <CoverImage src={image} fallback={tile} /> : tile}
        </Cover>
        <LeadCopy>
          {siteSource(lead)}
          <LeadTitle as="a" href={post.url} target="_blank" rel="noreferrer">
            {post.title}
          </LeadTitle>
          {(post.summary || lead.description) && (
            <Dek>{post.summary || lead.description}</Dek>
          )}
          <Meta>
            {[
              minutes(post.minutes),
              'New to you',
              `${matchPercent(lead)}% match`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Meta>
          <Actions>
            <Btn
              primary
              as="a"
              href={post.url}
              target="_blank"
              rel="noreferrer"
            >
              Read <ArrowSquareOut size={13} />
            </Btn>
            {lead.status == 'NEW' ? (
              <>
                <Btn type="button" onClick={() => acts.tryIt(lead)}>
                  Try a week
                </Btn>
                <Btn type="button" onClick={() => acts.follow(lead)}>
                  Follow
                </Btn>
                <Button tone="quiet" onClick={() => acts.dismiss(lead)}>
                  Not for me
                </Button>
              </>
            ) : (
              statusChip(lead)
            )}
          </Actions>
        </LeadCopy>
      </Lead>

      {issue.picks.length > 0 && (
        <section aria-label="From your reading">
          <SectionHead>
            <h2>From your reading</h2>
            <span>WHO LED YOU THERE</span>
          </SectionHead>
          <Picks>
            {issue.picks.map((s) => {
              const p = s.latest[0]
              const pic = picture(s)
              return (
                <Story key={s.id}>
                  <Cover
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    tabIndex={-1}
                    aria-hidden="true"
                    css={{ aspectRatio: '16 / 10' }}
                  >
                    {pic.image ? (
                      <CoverImage src={pic.image} fallback={pic.tile} />
                    ) : (
                      pic.tile
                    )}
                  </Cover>
                  {siteSource(s)}
                  <StoryTitle
                    as="a"
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.title}
                  </StoryTitle>
                  {(p.summary || s.description) && (
                    <StoryDek>{p.summary || s.description}</StoryDek>
                  )}
                  <StoryFoot>
                    <Meta>{minutes(p.minutes)}</Meta>
                    <FollowToggle
                      s={s}
                      onFollow={acts.follow}
                      onDismiss={acts.dismiss}
                    />
                  </StoryFoot>
                </Story>
              )
            })}
          </Picks>
        </section>
      )}

      <Lower>
        {issue.writers.length > 0 ? (
          <section aria-label="Writers you keep reading">
            <SectionHead>
              <h2>Writers you keep reading</h2>
              <span>ON THEIR OWN SITES</span>
            </SectionHead>
            <Brief>
              {issue.writers.map((s) => {
                const writer = s.reasons.find((r) => r.kind == 'writer')
                return (
                  <BriefRow key={s.id}>
                    <div style={{ minWidth: 0 }}>
                      {siteSource(s, writer?.guideName ?? whyLine(s))}
                      <BriefTitle
                        as="a"
                        href={s.latest[0].url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {s.latest[0].title}
                      </BriefTitle>
                    </div>
                    <BriefEnd>
                      <FollowToggle
                        s={s}
                        onFollow={acts.follow}
                        onDismiss={acts.dismiss}
                      />
                    </BriefEnd>
                  </BriefRow>
                )
              })}
            </Brief>
          </section>
        ) : (
          <div />
        )}
        <section aria-label="Your discoveries">
          <SectionHead>
            <h2>Your discoveries</h2>
            <span>FROM DISCOVER</span>
          </SectionHead>
          <Tally>
            <div>
              <b>{props.following}</b>
              <Label>Followed</Label>
            </div>
            <div>
              <b>{props.trying.length}</b>
              <Label>On trial</Label>
            </div>
            <div>
              <b>
                {nextEnd
                  ? new Date(nextEnd).toLocaleDateString(undefined, {
                      weekday: 'short',
                    })
                  : '—'}
              </b>
              <Label>{nextEnd ? 'Next trial ends' : 'No trials'}</Label>
            </div>
          </Tally>
        </section>
      </Lower>

      <Colophon>
        <p>
          That&apos;s this week&apos;s Discovery Edition. The next one is made
          on Saturday at {hourLabel(props.hour)}.
        </p>
        <Btn as={Link} href="/l/discover">
          Open Discover
        </Btn>
      </Colophon>
    </Issue>
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
