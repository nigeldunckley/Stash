import * as Dialog from '@radix-ui/react-dialog'
import { ArrowSquareOut, X } from '@phosphor-icons/react'
import { useRef } from 'react'
import { FeedSuggestion } from '../../../lib/networking/feedSuggestions'
import { shortTimeAgo } from '../../../lib/textFormatting'
import { CoverImage, IconButton, SiteIcon } from '../../elements/stash'
import { motion, reducedMotion } from '../../elements/stash/motion'
import { keyframes, styled } from '../../tokens/stitches.config'
import { Button, Chip, Label, Tile, Why } from './discoverParts'
import {
  cadence,
  fallbackIconFor,
  hostOf,
  iconFor,
  reasonLine,
} from './discoverText'

// A suggestion, story first: its latest post fills the top so the first
// thing you meet is the writing, then why it's here and what else it
// published. A sheet from the bottom on iPhone, a panel from the right on Mac.

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })
const fromRight = keyframes({
  from: { transform: 'translateX(24px)', opacity: 0 },
  to: { transform: 'none', opacity: 1 },
})
const fromBottom = keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'none' },
})

const Overlay = styled(Dialog.Overlay, {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  background: '$stScrim',
  animation: `${fadeIn} ${motion.base}`,
})

const Content = styled(Dialog.Content, {
  position: 'fixed',
  zIndex: 41,
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  overflow: 'hidden',
  background: '$stSurface',
  color: '$stInk',
  fontFamily: '$inter',
  outline: 'none',
  top: '12px',
  right: '12px',
  bottom: '12px',
  width: 'min(480px, calc(100vw - 24px))',
  border: '1px solid $stLine',
  borderRadius: '$lg',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04), 0 18px 48px rgba(0, 0, 0, 0.16)',
  animation: `${fromRight} ${motion.sheet}`,
  '@mdDown': {
    top: 'auto',
    left: 0,
    right: 0,
    bottom: 0,
    width: 'auto',
    maxHeight: '88dvh',
    border: 'none',
    borderTop: '1px solid $stLine',
    borderRadius: '16px 16px 0 0',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    animation: `${fromBottom} ${motion.sheet}`,
  },
  [reducedMotion]: { animation: 'none' },
})

const Grabber = styled('div', {
  display: 'none',
  '@mdDown': {
    display: 'block',
    position: 'absolute',
    top: '8px',
    left: '50%',
    marginLeft: '-18px',
    width: '36px',
    height: '4px',
    borderRadius: '4px',
    background: 'rgba(255, 255, 255, 0.8)',
    zIndex: 2,
  },
})

const Close = styled('div', {
  position: 'absolute',
  top: '10px',
  right: '10px',
  zIndex: 2,
  borderRadius: '$sm',
  background: '$stMaterialStrong',
  backdropFilter: 'blur(12px)',
})

const Scroll = styled('div', {
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  WebkitOverflowScrolling: 'touch',
  flex: 1,
})

const Hero = styled('div', {
  position: 'relative',
  height: '220px',
  flex: 'none',
  '@mdDown': { height: '180px' },
  '& > *': { width: '100%', height: '100%' },
})

const Body = styled('div', {
  display: 'grid',
  gap: '12px',
  padding: '18px 20px 20px',
})

const Source = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minWidth: 0,
  '& b': { display: 'block', fontWeight: 600, fontSize: '$ui' },
})

const Headline = styled('a', {
  fontFamily: '$serif',
  fontSize: '26px',
  lineHeight: 1.15,
  letterSpacing: '-0.01em',
  color: '$stInk',
  textDecoration: 'none',
  '&:hover': { textDecoration: 'underline', textUnderlineOffset: '3px' },
  '@mdDown': { fontSize: '24px' },
})

const Summary = styled('p', {
  margin: 0,
  fontFamily: '$serif',
  fontSize: '16px',
  lineHeight: 1.5,
  color: '$stInk2',
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const Reasons = styled('ul', {
  listStyle: 'none',
  margin: 0,
  padding: '10px 0 0',
  borderTop: '1px solid $stLine',
  display: 'grid',
  gap: '6px',
  '& li': { display: 'flex', lineHeight: 1.4 },
})

const More = styled('ol', {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  borderTop: '1px solid $stLine',
  '& li': { borderBottom: '1px solid $stLine' },
  '& a': {
    display: 'grid',
    gridTemplateColumns: '24px minmax(0, 1fr) auto',
    gap: '10px',
    alignItems: 'baseline',
    padding: '10px 0',
    color: '$stInk',
    textDecoration: 'none',
    fontFamily: '$serif',
    fontSize: '16px',
    lineHeight: 1.3,
  },
  '& a:hover span:nth-child(2)': {
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
})

const Actions = styled('div', {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px',
  padding: '12px 20px 16px',
  borderTop: '1px solid $stLine',
  background: '$stSurface',
  flex: 'none',
  '& > [data-wide]': { gridColumn: '1 / -1' },
})

const minutes = (m?: number) => (m ? `${m} min` : '')

type Props = {
  suggestion?: FeedSuggestion
  onClose: () => void
  onFollow: (s: FeedSuggestion, from: HTMLElement | null) => void
  onTry: (s: FeedSuggestion) => void
  onDismiss: (s: FeedSuggestion) => void
}

export function SuggestionSheet(props: Props): JSX.Element {
  const s = props.suggestion
  const iconRef = useRef<HTMLDivElement>(null)
  const lead = s?.latest[0]
  const following = s?.status == 'FOLLOWING' || s?.status == 'KEPT'
  const trying = s?.status == 'TRIAL'

  return (
    <Dialog.Root open={!!s} onOpenChange={(open) => !open && props.onClose()}>
      <Dialog.Portal>
        <Overlay />
        <Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {s && (
            <>
              <Grabber />
              <Close>
                <Dialog.Close asChild>
                  <IconButton label="Close">
                    <X size={16} />
                  </IconButton>
                </Dialog.Close>
              </Close>
              <Scroll>
                <Hero>
                  {lead?.image ? (
                    <CoverImage
                      src={lead.image}
                      fallback={
                        <Tile>
                          <span>{s.title.charAt(0)}</span>
                        </Tile>
                      }
                    />
                  ) : (
                    <Tile>
                      <span>{s.title.charAt(0)}</span>
                    </Tile>
                  )}
                </Hero>
                <Body>
                  <Source>
                    <div ref={iconRef}>
                      <SiteIcon
                        src={iconFor(s)}
                        fallbackSrc={fallbackIconFor(s)}
                        name={s.title}
                        size={32}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Dialog.Title asChild>
                        <b>{s.title}</b>
                      </Dialog.Title>
                      <Label css={{ textTransform: 'none' }}>
                        {[hostOf(s.siteUrl), cadence(s.postsPerWeek)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Label>
                    </div>
                  </Source>
                  {lead && (
                    <>
                      <Headline
                        href={lead.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {lead.title}
                      </Headline>
                      {lead.summary && <Summary>{lead.summary}</Summary>}
                      <Label>
                        {[
                          lead.publishedAt && shortTimeAgo(lead.publishedAt),
                          minutes(lead.minutes),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Label>
                    </>
                  )}
                  {!lead && s.description && <Summary>{s.description}</Summary>}

                  <Reasons aria-label="Why it's here">
                    {s.reasons.slice(0, 4).map((r) => (
                      <li key={`${r.kind}-${r.guide}`}>
                        <Why>{reasonLine(r)}</Why>
                      </li>
                    ))}
                  </Reasons>

                  {s.latest.length > 1 && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <Label>Also recently</Label>
                      <More>
                        {s.latest.slice(1, 5).map((post, i) => (
                          <li key={post.url}>
                            <a href={post.url} target="_blank" rel="noreferrer">
                              <Label>{String(i + 2).padStart(2, '0')}</Label>
                              <span>{post.title}</span>
                              <Label>{minutes(post.minutes)}</Label>
                            </a>
                          </li>
                        ))}
                      </More>
                    </div>
                  )}
                </Body>
              </Scroll>
              <Actions>
                {lead ? (
                  <Button
                    as="a"
                    href={lead.url}
                    target="_blank"
                    rel="noreferrer"
                    size="large"
                  >
                    Keep reading
                    <ArrowSquareOut size={14} />
                  </Button>
                ) : (
                  <Button size="large" onClick={() => props.onDismiss(s)}>
                    Not for me
                  </Button>
                )}
                {following ? (
                  <Chip
                    accent
                    css={{
                      justifySelf: 'stretch',
                      height: '42px',
                      justifyContent: 'center',
                      borderRadius: '$md',
                    }}
                  >
                    Following
                  </Chip>
                ) : (
                  <Button
                    tone="accent"
                    size="large"
                    disabled={trying}
                    onClick={() => props.onTry(s)}
                  >
                    {trying ? 'Trying this week' : 'Try for a week'}
                  </Button>
                )}
                {!following && (
                  <Button
                    tone="primary"
                    size="large"
                    data-wide
                    onClick={() => props.onFollow(s, iconRef.current)}
                  >
                    {trying ? `Keep ${s.title}` : `Follow ${s.title}`}
                  </Button>
                )}
                {lead && !following && !trying && (
                  <Button
                    tone="quiet"
                    onClick={() => props.onDismiss(s)}
                    data-wide
                  >
                    Not for me
                  </Button>
                )}
              </Actions>
            </>
          )}
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
