import { ArrowClockwise, Check, Plus } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  FEED_SUGGESTIONS_KEY,
  FeedSuggestion,
  isChannel,
  isStarter,
  refreshFeedSuggestions,
  setFeedSuggestionsEnabled,
  updateFeedSuggestion,
  useFeedSuggestions,
  useSuggestionActions,
} from '../../../lib/networking/feedSuggestions'
import { shortTimeAgo } from '../../../lib/textFormatting'
import { showErrorToast } from '../../../lib/toastHelpers'
import {
  CoverImage,
  IconButton,
  ListSkeleton,
  showUndoToast,
  SiteIcon,
} from '../../elements/stash'
import { motion, reducedMotion } from '../../elements/stash/motion'
import { keyframes, styled } from '../../tokens/stitches.config'
import { Button, Chain, Chip, Label, Pill, Tile, Why } from './discoverParts'
import {
  cadence,
  fallbackIconFor,
  guideIcon,
  iconFor,
  matchPercent,
  trialDaysLeft,
  whyLine,
  whySentence,
} from './discoverText'
import { flyToFeeds } from './flyToFeeds'
import { ReadingMap } from './ReadingMap'
import { SuggestionSheet } from './SuggestionSheet'

// Discover: feeds worth meeting, found in what you read. It lives apart from
// Read and Watch because it's a different kind of place: nothing here is in
// your feeds yet.

const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'none' },
})

const Page = styled('main', {
  width: '100%',
  minHeight: '100vh',
  boxSizing: 'border-box',
  color: '$stInk',
  fontFamily: '$inter',
  padding: '24px 32px 96px',
  '@mdDown': { padding: '16px 16px 48px' },
})

const Column = styled('div', {
  maxWidth: '1180px',
  margin: '0 auto',
  display: 'grid',
  gap: '44px',
  '@mdDown': { gap: '32px' },
  '& > *': { animation: `${rise} ${motion.slow} both` },
  '& > *:nth-child(2)': { animationDelay: '40ms' },
  '& > *:nth-child(3)': { animationDelay: '80ms' },
  '& > *:nth-child(n+4)': { animationDelay: '120ms' },
  [reducedMotion]: { '& > *': { animation: 'none' } },
})

// ---------------------------------------------------------------------------
// Masthead

const Crumb = styled('nav', {
  display: 'flex',
  gap: '6px',
  fontFamily: '$mono',
  fontSize: '$caption',
  color: '$stMuted',
  marginBottom: '10px',
  '& a': { color: 'inherit', textDecoration: 'none' },
  '& a:hover': { color: '$stInk' },
  '& [aria-current]': { color: '$stInk' },
})

const MastRow = styled('header', {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: '24px',
  paddingBottom: '16px',
  borderBottom: '2px solid $stInk',
  '@mdDown': { flexDirection: 'column', alignItems: 'stretch', gap: '10px' },
})

const Title = styled('h1', {
  margin: 0,
  fontFamily: '$display',
  fontSize: '56px',
  fontWeight: 700,
  letterSpacing: '-0.05em',
  lineHeight: 0.95,
  em: { fontStyle: 'normal', color: '$stAccent' },
  '@mdDown': { fontSize: '40px' },
})

const Lede = styled('p', {
  margin: 0,
  maxWidth: '520px',
  fontFamily: '$serif',
  fontSize: '18px',
  lineHeight: 1.45,
  color: '$stInk2',
  textAlign: 'right',
  b: { fontWeight: 500, color: '$stInk' },
  '@mdDown': { textAlign: 'left', fontSize: '16px' },
})

const MastFoot = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  marginTop: '10px',
})

// ---------------------------------------------------------------------------
// Try this week: the strongest match as a magazine spread

const Spread = styled('section', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
  gap: '32px',
  alignItems: 'stretch',
  '@lgDown': { gridTemplateColumns: 'minmax(0, 1fr)', gap: '18px' },
})

const SpreadImage = styled('button', {
  all: 'unset',
  cursor: 'pointer',
  position: 'relative',
  minHeight: '380px',
  borderRadius: '$md',
  overflow: 'hidden',
  border: '1px solid $stLine',
  '& > *': { position: 'absolute', inset: 0, width: '100%', height: '100%' },
  '& img': { transition: `transform ${motion.slow}` },
  '@media (hover: hover)': { '&:hover img': { transform: 'scale(1.02)' } },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '@lgDown': { minHeight: 0, aspectRatio: '16 / 9' },
})

const Eyebrow = styled('div', {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '12px',
  paddingBottom: '8px',
  borderBottom: '1px solid $stLine',
  '& > b': {
    fontSize: '$caption',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
})

const SpreadCopy = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  minWidth: 0,
})

const Masthead = styled('h2', {
  margin: 0,
  fontFamily: '$serif',
  fontSize: '60px',
  fontWeight: 400,
  lineHeight: 0.98,
  letterSpacing: '-0.02em',
  '@mdDown': { fontSize: '42px' },
})

const SpreadWhy = styled('p', {
  margin: 0,
  fontFamily: '$serif',
  fontSize: '18px',
  lineHeight: 1.45,
  color: '$stInk2',
})

const Taste = styled('ol', {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  borderTop: '1px solid $stLine',
  '& li': { borderBottom: '1px solid $stLine' },
  '& a': {
    display: 'grid',
    gridTemplateColumns: '28px minmax(0, 1fr) auto',
    gap: '10px',
    alignItems: 'baseline',
    padding: '11px 0',
    color: '$stInk',
    textDecoration: 'none',
    fontFamily: '$serif',
    fontSize: '17px',
    lineHeight: 1.3,
  },
  '& a:hover > span:nth-child(2)': {
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
})

const Acts = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginTop: 'auto',
})

// ---------------------------------------------------------------------------
// Shelves

const Shelf = styled('section', { display: 'grid', gap: '14px' })

const ShelfRow = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
  gap: '16px',
  '@mdDown': {
    display: 'flex',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    margin: '0 -16px',
    padding: '0 16px 4px',
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
    '& > *': { flex: '0 0 78%', scrollSnapAlign: 'start' },
  },
})

const Card = styled('article', {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: '9px',
  padding: '10px 10px 14px',
  borderRadius: '$md',
  border: '1px solid $stLine',
  background: '$stSurface',
  cursor: 'pointer',
  minWidth: 0,
  transition: `border-color ${motion.fast}, transform ${motion.base}, box-shadow ${motion.base}`,
  '@media (hover: hover)': {
    '&:hover': {
      borderColor: '$stLineStrong',
      transform: 'translateY(-2px)',
      boxShadow: '0 12px 28px -18px rgba(9, 9, 11, 0.35)',
    },
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  [reducedMotion]: { '&:hover': { transform: 'none' } },
  variants: {
    done: { true: { opacity: 0.72 } },
  },
})

const Collage = styled('div', {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr',
  gridTemplateRows: '1fr 1fr',
  gap: '3px',
  height: '132px',
  borderRadius: '$sm',
  overflow: 'hidden',
  '& > *': { width: '100%', height: '100%', minHeight: 0 },
  '& > :first-child': { gridRow: '1 / -1' },
})

const NameRow = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  padding: '0 2px',
})

const Name = styled('h3', {
  margin: 0,
  flex: 1,
  minWidth: 0,
  fontFamily: '$serif',
  fontSize: '21px',
  fontWeight: 400,
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

const CardHead = styled('span', {
  padding: '0 2px',
  fontFamily: '$serif',
  fontSize: '15px',
  lineHeight: 1.35,
  color: '$stInk2',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const CardMeta = styled('div', {
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
  padding: '0 2px',
  marginTop: 'auto',
})

const Writers = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: '16px',
  '@mdDown': { gridTemplateColumns: 'minmax(0, 1fr)' },
})

const WriterCard = styled(Card, {
  display: 'grid',
  gridTemplateColumns: '84px minmax(0, 1fr)',
  gap: '14px',
  padding: '12px',
})

const Monogram = styled('div', {
  display: 'grid',
  placeItems: 'center',
  height: '104px',
  borderRadius: '$sm',
  background: '$stInk',
  color: '$stSurface',
  fontFamily: '$serif',
  fontSize: '52px',
  lineHeight: 1,
})

const Where = styled('span', {
  fontSize: '$small',
  lineHeight: 1.5,
  color: '$stInk2',
})

const Quiet = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '16px 18px',
  borderRadius: '$md',
  border: '1px dashed $stLineStrong',
  color: '$stMuted',
  fontSize: '$small',
  lineHeight: 1.5,
  b: { color: '$stInk2', fontWeight: 500 },
})

const Empty = styled('div', {
  display: 'grid',
  justifyItems: 'start',
  gap: '14px',
  padding: '28px 0',
  maxWidth: '560px',
  fontFamily: '$serif',
  fontSize: '18px',
  lineHeight: 1.5,
  color: '$stInk2',
})

// ---------------------------------------------------------------------------

type ShelfGroup = {
  key: string
  title: React.ReactNode
  note: string
  items: FeedSuggestion[]
}

const isNew = (s: FeedSuggestion) => s.status == 'NEW'

// Groups suggestions by what led to them, so each shelf explains itself.
const shelvesFor = (items: FeedSuggestion[]): ShelfGroup[] => {
  const byGuide = new Map<string, ShelfGroup>()
  const loose: FeedSuggestion[] = []
  for (const s of items) {
    const lead = s.reasons.find((r) => r.kind != 'writer')
    if (!lead) {
      loose.push(s)
      continue
    }
    const key = `${lead.kind == 'save' ? 'save' : 'guide'}:${lead.guide}`
    const group: ShelfGroup = byGuide.get(key) ?? {
      key,
      title:
        lead.kind == 'save' ? (
          'From sites you save'
        ) : (
          <>
            Because you read
            <Pill name={lead.guideName} icon={guideIcon(lead)} />
          </>
        ),
      note:
        lead.kind == 'save'
          ? 'You keep saving from these'
          : 'Linked from it, or close to it',
      items: [],
    }
    group.items.push(s)
    byGuide.set(key, group)
  }
  const groups = [...byGuide.values()]
  const shelves = groups.filter((g) => g.items.length > 1)
  groups
    .filter((g) => g.items.length == 1)
    .forEach((g) => loose.push(...g.items))
  if (loose.length) {
    shelves.push({
      key: 'more',
      title: 'More worth meeting',
      note: 'One link each, from different corners of your reading',
      items: loose.sort((a, b) => b.score - a.score),
    })
  }
  return shelves
}

function Pictures(props: { s: FeedSuggestion }): JSX.Element {
  const images = props.s.latest
    .map((p) => p.image)
    .filter((i): i is string => !!i)
    .slice(0, 3)
  const letter = props.s.title.charAt(0)
  return (
    <Collage aria-hidden="true">
      {[0, 1, 2].map((i) =>
        images[i] ? (
          <CoverImage
            key={i}
            src={images[i]}
            fallback={<Tile>{i == 0 && <span>{letter}</span>}</Tile>}
          />
        ) : (
          <Tile key={i}>{i == 0 && <span>{letter}</span>}</Tile>
        )
      )}
    </Collage>
  )
}

function FollowButton(props: {
  s: FeedSuggestion
  onFollow: (s: FeedSuggestion, from: HTMLElement | null) => void
  iconRef: React.RefObject<HTMLElement>
}): JSX.Element {
  const done = props.s.status != 'NEW'
  return (
    <IconButton
      label={
        done
          ? props.s.status == 'TRIAL'
            ? 'Trying this week'
            : 'Following'
          : `Follow ${props.s.title}`
      }
      size="sm"
      active={done}
      onClick={(event) => {
        event.stopPropagation()
        if (!done) props.onFollow(props.s, props.iconRef.current)
      }}
    >
      {done ? <Check size={14} weight="bold" /> : <Plus size={14} />}
    </IconButton>
  )
}

function SuggestionCard(props: {
  s: FeedSuggestion
  onOpen: (s: FeedSuggestion) => void
  onFollow: (s: FeedSuggestion, from: HTMLElement | null) => void
}): JSX.Element {
  const { s } = props
  const iconRef = useRef<HTMLSpanElement>(null)
  const days = trialDaysLeft(s)
  return (
    <Card
      tabIndex={0}
      done={s.status == 'FOLLOWING'}
      onClick={() => props.onOpen(s)}
      onKeyDown={(e) => {
        if (e.key == 'Enter' || e.key == ' ') {
          e.preventDefault()
          props.onOpen(s)
        }
      }}
      aria-label={s.title}
    >
      <Pictures s={s} />
      <NameRow>
        <span ref={iconRef} style={{ display: 'inline-flex' }}>
          <SiteIcon
            src={iconFor(s)}
            fallbackSrc={fallbackIconFor(s)}
            name={s.title}
            size={20}
          />
        </span>
        <Name>{s.title}</Name>
        <FollowButton s={s} onFollow={props.onFollow} iconRef={iconRef} />
      </NameRow>
      <Why css={{ padding: '0 2px' }}>{whyLine(s)}</Why>
      {s.latest[0] && <CardHead>{s.latest[0].title}</CardHead>}
      <CardMeta>
        {s.status == 'TRIAL' ? (
          <Chip accent>
            {days == 0
              ? 'Trial over · keep it?'
              : days
              ? `Trial · ${days} day${days == 1 ? '' : 's'} left`
              : 'Trial'}
          </Chip>
        ) : s.status == 'FOLLOWING' ? (
          <Chip accent>Following</Chip>
        ) : (
          <>
            {isChannel(s) && <Chip>YouTube</Chip>}
            {cadence(s.postsPerWeek) && <Chip>{cadence(s.postsPerWeek)}</Chip>}
          </>
        )}
      </CardMeta>
    </Card>
  )
}

function WriterCardView(props: {
  s: FeedSuggestion
  onOpen: (s: FeedSuggestion) => void
  onFollow: (s: FeedSuggestion, from: HTMLElement | null) => void
}): JSX.Element {
  const { s } = props
  const writer = s.reasons.find((r) => r.kind == 'writer')
  const name = writer?.guideName ?? s.author ?? s.title
  const monoRef = useRef<HTMLDivElement>(null)
  return (
    <WriterCard
      tabIndex={0}
      done={s.status == 'FOLLOWING'}
      onClick={() => props.onOpen(s)}
      onKeyDown={(e) => {
        if (e.key == 'Enter' || e.key == ' ') {
          e.preventDefault()
          props.onOpen(s)
        }
      }}
      aria-label={name}
    >
      <Monogram ref={monoRef} aria-hidden="true">
        {name.charAt(0)}
      </Monogram>
      <div
        style={{ display: 'grid', gap: 6, alignContent: 'start', minWidth: 0 }}
      >
        <Name css={{ whiteSpace: 'normal' }}>{name}</Name>
        <Where>
          You finished {writer?.count ?? 'several'} of their pieces.
        </Where>
        <Why>Their own site: {s.title}</Why>
        <CardMeta css={{ alignItems: 'center', marginTop: 4 }}>
          {s.status == 'NEW' ? (
            <Button
              onClick={(e) => {
                e.stopPropagation()
                props.onFollow(s, monoRef.current)
              }}
              css={{ height: '28px', padding: '0 10px', fontSize: '$caption' }}
            >
              Follow their site
            </Button>
          ) : (
            <Chip accent>{s.status == 'TRIAL' ? 'Trying' : 'Following'}</Chip>
          )}
          {cadence(s.postsPerWeek) && <Chip>{cadence(s.postsPerWeek)}</Chip>}
        </CardMeta>
      </div>
    </WriterCard>
  )
}

export function StashDiscover(): JSX.Element {
  const queryClient = useQueryClient()
  const { data, isPending, isError } = useFeedSuggestions()
  const actions = useSuggestionActions()
  const [open, setOpen] = useState<string>()
  const [looking, setLooking] = useState(false)
  const heroIcon = useRef<HTMLSpanElement>(null)

  const suggestions = useMemo(() => data?.suggestions ?? [], [data])
  // Suggestions you act on stay where they are, ticked, until you leave, so
  // the page doesn't shift under you.
  const [actedOn, setActedOn] = useState<Set<string>>(new Set())
  const markActed = useCallback(
    (id: string) => setActedOn((ids) => new Set(ids).add(id)),
    []
  )
  const fresh = useMemo(
    () =>
      suggestions
        .filter((s) => isNew(s) || actedOn.has(s.id))
        .sort((a, b) => b.score - a.score),
    [suggestions, actedOn]
  )
  // What your reading led to, channels for the Watch tab, and starting
  // points while there's too little of the first.
  const own = fresh.filter((s) => !isChannel(s) && !isStarter(s))
  const channels = fresh.filter(isChannel)
  const starters = fresh.filter(isStarter)
  const hero = own.find((s) => s.feedUrl)
  const writers = own.filter((s) => s != hero && s.reasons[0]?.kind == 'writer')
  const shelves = useMemo(
    () =>
      shelvesFor(
        fresh.filter(
          (s) =>
            s != hero &&
            s.reasons[0]?.kind != 'writer' &&
            !isChannel(s) &&
            !isStarter(s)
        )
      ),
    [fresh, hero]
  )
  const trials = suggestions.filter(
    (s) => s.status == 'TRIAL' && !actedOn.has(s.id)
  )
  const followed = suggestions.filter(
    (s) => s.status == 'FOLLOWING' && !actedOn.has(s.id)
  )
  const openSuggestion = suggestions.find((s) => s.id == open)

  const follow = useCallback(
    async (s: FeedSuggestion, from: HTMLElement | null) => {
      if (s.status == 'TRIAL') {
        await updateFeedSuggestion(s.id, 'KEEP')
        await queryClient.invalidateQueries({
          queryKey: [FEED_SUGGESTIONS_KEY],
        })
        showUndoToast(`Keeping ${s.title}`)
        return
      }
      flyToFeeds(from)
      markActed(s.id)
      const undo = await actions.follow(s)
      if (!undo) {
        showErrorToast(`Could not follow ${s.title}`)
        return
      }
      showUndoToast(
        isChannel(s) ? `Following ${s.title} in Watch` : `Following ${s.title}`,
        undo
      )
    },
    [actions, markActed, queryClient]
  )

  const tryIt = useCallback(
    async (s: FeedSuggestion) => {
      markActed(s.id)
      const undo = await actions.tryForAWeek(s)
      if (!undo) {
        showErrorToast(`Could not add ${s.title}`)
        return
      }
      showUndoToast(`Trying ${s.title} for a week`, undo)
    },
    [actions, markActed]
  )

  const dismiss = useCallback(
    async (s: FeedSuggestion) => {
      setOpen(undefined)
      const undo = await actions.dismiss(s)
      showUndoToast(`Won't suggest ${s.title} again`, undo)
    },
    [actions]
  )

  const drop = useCallback(
    async (s: FeedSuggestion) => {
      setOpen(undefined)
      const undo = await actions.drop(s)
      showUndoToast(`Stopped trying ${s.title}`, undo)
    },
    [actions]
  )

  const lookAgain = async () => {
    setLooking(true)
    try {
      if (!(await refreshFeedSuggestions())) throw new Error('not queued')
      showUndoToast(
        'Looking through your reading. Check back in a few minutes.'
      )
    } catch {
      showErrorToast('Could not start a new look')
    } finally {
      setTimeout(() => setLooking(false), 4000)
    }
  }

  const turnOn = async () => {
    setLooking(true)
    try {
      await setFeedSuggestionsEnabled(true)
      await queryClient.invalidateQueries({ queryKey: [FEED_SUGGESTIONS_KEY] })
      showUndoToast(
        'Suggestions are on. Stash is looking through your reading now.'
      )
    } catch {
      showErrorToast('Could not turn suggestions on')
    } finally {
      setLooking(false)
    }
  }

  const off = data?.enabled === false
  // Starting points aren't something your reading found.
  const found = fresh.filter((s) => !isStarter(s))
  const articles = data?.articlesConsidered ?? 0
  const lede = off ? (
    <>Suggestions are off, so Stash isn&apos;t looking for new feeds.</>
  ) : data?.builtAt && articles > 0 ? (
    <>
      From <b>{articles} articles you read</b> in the last two months,{' '}
      {found.length == 0
        ? 'nothing new cleared the bar today.'
        : found.length == 1
        ? 'one feed worth meeting.'
        : `${found.length} feeds worth meeting.`}
    </>
  ) : (
    <>Feeds worth meeting, found in what you read and who you follow.</>
  )

  return (
    <Page>
      <Column>
        <div>
          <Crumb aria-label="Breadcrumb">
            <Link href="/l/subscriptions">Feeds</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Discover</span>
          </Crumb>
          <MastRow>
            <Title>
              Discover<em>.</em>
            </Title>
            <Lede>{lede}</Lede>
          </MastRow>
          <MastFoot css={off ? { display: 'none' } : undefined}>
            <Label>
              {data?.builtAt
                ? `Updated ${shortTimeAgo(
                    data.builtAt
                  ).toLowerCase()} · each night at 03:00`
                : 'Updated each night at 03:00'}
            </Label>
            <Button
              tone="quiet"
              onClick={lookAgain}
              disabled={looking}
              css={{ height: '28px', padding: '0 6px', fontSize: '$caption' }}
            >
              <ArrowClockwise size={13} />
              {looking ? 'Looking…' : 'Look again'}
            </Button>
          </MastFoot>
        </div>

        {isPending ? (
          <ListSkeleton />
        ) : isError ? (
          <Empty>
            Discover couldn&apos;t load just now. Try again in a moment.
          </Empty>
        ) : off ? (
          <Empty>
            Turn suggestions back on and Stash will look through what you read
            each night for feeds worth meeting. Nothing is suggested while
            they&apos;re off.
            <Button tone="primary" onClick={turnOn} disabled={looking}>
              {looking ? 'Turning on…' : 'Turn suggestions on'}
            </Button>
          </Empty>
        ) : !data?.builtAt ? (
          <Empty>
            Stash looks through what you read each night and suggests the feeds
            your favourite writers keep pointing to. The first look hasn&apos;t
            run yet.
            <Button tone="primary" onClick={lookAgain} disabled={looking}>
              {looking ? 'Looking…' : 'Look now'}
            </Button>
          </Empty>
        ) : fresh.length == 0 && !trials.length ? (
          <Empty>
            Nothing new cleared the bar today. Suggestions grow from the
            articles you finish and highlight, so the more you read from your
            feeds, the more Stash has to go on.
          </Empty>
        ) : null}

        <ReadingMap
          suggestions={fresh}
          onOpen={(s) => setOpen(s.id)}
          onFollow={follow}
          onTry={tryIt}
        />

        {hero && (
          <Spread aria-label="Try this week">
            <SpreadImage
              onClick={() => setOpen(hero.id)}
              aria-label={`Read a sample of ${hero.title}`}
            >
              {hero.latest[0]?.image ? (
                <CoverImage
                  src={hero.latest[0].image}
                  fallback={
                    <Tile>
                      <span style={{ fontSize: 120 }}>
                        {hero.title.charAt(0)}
                      </span>
                    </Tile>
                  }
                />
              ) : (
                <Tile>
                  <span style={{ fontSize: 120 }}>{hero.title.charAt(0)}</span>
                </Tile>
              )}
            </SpreadImage>
            <SpreadCopy>
              <Eyebrow>
                <b>Try this week</b>
                <Label>The strongest match · {matchPercent(hero)}%</Label>
              </Eyebrow>
              <Chain reasons={hero.reasons}>
                <span ref={heroIcon} style={{ display: 'inline-flex' }}>
                  <Pill
                    name={hero.title}
                    icon={iconFor(hero)}
                    fallbackIcon={fallbackIconFor(hero)}
                    suggested
                  />
                </span>
              </Chain>
              <Masthead>{hero.title}</Masthead>
              <SpreadWhy>
                {hero.description
                  ? `${hero.description.replace(/\.?$/, '.')} `
                  : ''}
                {whySentence(hero)}
              </SpreadWhy>
              {hero.latest.length > 0 && (
                <Taste aria-label="Its latest">
                  {hero.latest.slice(0, 3).map((post, i) => (
                    <li key={post.url}>
                      <a href={post.url} target="_blank" rel="noreferrer">
                        <Label>{String(i + 1).padStart(2, '0')}</Label>
                        <span>{post.title}</span>
                        <Label>
                          {post.minutes ? `${post.minutes} min` : ''}
                        </Label>
                      </a>
                    </li>
                  ))}
                </Taste>
              )}
              <Acts>
                {hero.status == 'NEW' ? (
                  <>
                    <Button tone="accent" onClick={() => tryIt(hero)}>
                      Try for a week
                    </Button>
                    <Button
                      tone="primary"
                      onClick={() => follow(hero, heroIcon.current)}
                    >
                      Follow
                    </Button>
                  </>
                ) : (
                  <Chip accent css={{ height: '34px', padding: '0 14px' }}>
                    {hero.status == 'TRIAL' ? 'Trying this week' : 'Following'}
                  </Chip>
                )}
                <Button onClick={() => setOpen(hero.id)}>Read a sample</Button>
              </Acts>
            </SpreadCopy>
          </Spread>
        )}

        {trials.length > 0 && (
          <Shelf aria-label="Trying this week">
            <Eyebrow>
              <b>Trying this week</b>
              <Label css={{ '@smDown': { display: 'none' } }}>
                In your feeds for seven days, then you decide
              </Label>
            </Eyebrow>
            <ShelfRow>
              {trials.map((s) => (
                <SuggestionCard
                  key={s.id}
                  s={s}
                  onOpen={(x) => setOpen(x.id)}
                  onFollow={follow}
                />
              ))}
            </ShelfRow>
          </Shelf>
        )}

        {shelves.map((shelf) => (
          <Shelf
            key={shelf.key}
            aria-label={
              typeof shelf.title == 'string' ? shelf.title : undefined
            }
          >
            <Eyebrow>
              <b>{shelf.title}</b>
              <Label css={{ '@smDown': { display: 'none' } }}>
                {shelf.note}
              </Label>
            </Eyebrow>
            <ShelfRow>
              {shelf.items.map((s) => (
                <SuggestionCard
                  key={s.id}
                  s={s}
                  onOpen={(x) => setOpen(x.id)}
                  onFollow={follow}
                />
              ))}
            </ShelfRow>
          </Shelf>
        ))}

        {channels.length > 0 && (
          <Shelf aria-label="For your Watch tab">
            <Eyebrow>
              <b>For your Watch tab</b>
              <Label css={{ '@smDown': { display: 'none' } }}>
                YouTube channels the pieces you read link to
              </Label>
            </Eyebrow>
            <ShelfRow>
              {channels.map((s) => (
                <SuggestionCard
                  key={s.id}
                  s={s}
                  onOpen={(x) => setOpen(x.id)}
                  onFollow={follow}
                />
              ))}
            </ShelfRow>
          </Shelf>
        )}

        {starters.length > 0 && (
          <Shelf aria-label="Starting points">
            <Eyebrow>
              <b>Starting points</b>
              <Label css={{ '@smDown': { display: 'none' } }}>
                Well-kept sites to begin with, until your reading leads further
              </Label>
            </Eyebrow>
            <ShelfRow>
              {starters.map((s) => (
                <SuggestionCard
                  key={s.id}
                  s={s}
                  onOpen={(x) => setOpen(x.id)}
                  onFollow={follow}
                />
              ))}
            </ShelfRow>
          </Shelf>
        )}

        {writers.length > 0 && (
          <Shelf aria-label="Writers you keep reading">
            <Eyebrow>
              <b>Writers you keep reading</b>
              <Label css={{ '@smDown': { display: 'none' } }}>
                Bylines you finish, wherever they publish
              </Label>
            </Eyebrow>
            <Writers>
              {writers.map((s) => (
                <WriterCardView
                  key={s.id}
                  s={s}
                  onOpen={(x) => setOpen(x.id)}
                  onFollow={follow}
                />
              ))}
            </Writers>
          </Shelf>
        )}

        {followed.length > 0 && (
          <Quiet>
            <span>
              <b>
                Followed from Discover:{' '}
                {followed.map((s) => s.title).join(', ')}.
              </b>{' '}
              Their stories are in Feeds.
            </span>
          </Quiet>
        )}
      </Column>

      <SuggestionSheet
        suggestion={openSuggestion}
        onClose={() => setOpen(undefined)}
        onFollow={(s, from) => {
          follow(s, from)
        }}
        onTry={(s) => {
          tryIt(s)
        }}
        onDismiss={dismiss}
        onDrop={drop}
      />
    </Page>
  )
}
