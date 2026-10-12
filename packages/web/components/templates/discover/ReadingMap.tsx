import { BookmarkSimple, PenNib } from '@phosphor-icons/react'
import { useMemo, useRef, useState } from 'react'
import { FeedSuggestion } from '../../../lib/networking/feedSuggestions'
import { SiteIcon } from '../../elements/stash'
import { motion, reducedMotion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import { Button, Chip, Label, Why } from './discoverParts'
import {
  fallbackIconFor,
  guideIcon,
  iconFor,
  matchPercent,
  whyLine,
} from './discoverText'
import {
  layoutReadingMap,
  MAC_MAP,
  MapGuide,
  MapShape,
  PHONE_MAP,
  reasonAmount,
  reasonStrength,
} from './mapLayout'

// The map at the top of Discover: you in the middle, the feeds that led
// somewhere around you, and what they led to on the outside. Pointing at a
// suggestion lights up the lines from the feeds that brought it.

const Root = styled('section', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 300px',
  border: '1px solid $stLine',
  borderRadius: '$lg',
  overflow: 'hidden',
  background: '$stCanvas',
  '@mdDown': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    margin: '0 -16px',
    borderRadius: 0,
    borderLeft: 'none',
    borderRight: 'none',
  },
})

const MapArea = styled('div', {
  position: 'relative',
  padding: '44px 12px 36px',
  variants: {
    only: {
      mac: { '@mdDown': { display: 'none' } },
      phone: {
        display: 'none',
        padding: '8px 0 4px',
        '@mdDown': { display: 'block' },
      },
    },
  },
})

const MapTitle = styled('div', {
  position: 'absolute',
  left: '18px',
  top: '14px',
  display: 'grid',
  gap: '2px',
  b: { fontFamily: '$inter', fontSize: '$small', fontWeight: 600 },
})

const Legend = styled('div', {
  position: 'absolute',
  left: '18px',
  bottom: '12px',
  display: 'flex',
  gap: '14px',
  alignItems: 'center',
  '& i': {
    display: 'inline-block',
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    marginRight: '5px',
    verticalAlign: '-1px',
  },
})

const Canvas = styled('div', {
  position: 'relative',
  width: '100%',
  margin: '0 auto',
})

const Lines = styled('svg', {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  overflow: 'visible',
  '& .ring': {
    fill: 'none',
    stroke: '$stLineStrong',
    strokeDasharray: '2 4',
  },
  '& .spoke': { stroke: '$stLine', strokeWidth: 1.2 },
  '& .edge': {
    fill: 'none',
    stroke: '$stLineStrong',
    transition: `stroke ${motion.base}, opacity ${motion.base}`,
  },
  '& .edge[data-hot="true"]': { stroke: '$stAccent' },
  '& .edge[data-hot="false"]': { opacity: 0.22 },
  [reducedMotion]: { '& .edge': { transition: 'none' } },
})

const At = styled('div', {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
})

const You = styled(At, {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: '$stInk',
  color: '$stSurface',
  fontFamily: '$inter',
  fontSize: '11px',
  fontWeight: 700,
  variants: { small: { true: { width: '28px', height: '28px' } } },
})

const GuideDot = styled(At, {
  display: 'grid',
  placeItems: 'center',
  borderRadius: '50%',
  background: '$stSurface',
  boxShadow: '0 0 0 1.5px $colors$stInk',
  color: '$stInk2',
})

const GuideName = styled('span', {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
  color: '$stMuted',
  // A halo of the map's own colour, so lines passing behind don't strike
  // through the name.
  background: '$stCanvas',
  padding: '0 3px',
  borderRadius: '3px',
  whiteSpace: 'nowrap',
  maxWidth: '150px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  pointerEvents: 'none',
})

const Node = styled('button', {
  all: 'unset',
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  display: 'grid',
  placeItems: 'center',
  borderRadius: '50%',
  cursor: 'pointer',
  background: '$stAccentTint',
  boxShadow: '0 0 0 1.5px $colors$stAccent',
  transition: `opacity ${motion.base}, background ${motion.base}, transform ${motion.fast}`,
  '& > span:first-child': { borderRadius: '50%' },
  '&[data-dim="true"]': { opacity: 0.5 },
  '&[data-selected="true"]': {
    background: '$stAccent',
    zIndex: 1,
  },
  '&:focus-visible': {
    outline: '2px solid $stAccent',
    outlineOffset: '3px',
  },
  '@media (hover: hover)': {
    '&:hover': { transform: 'translate(-50%, -50%) scale(1.06)' },
  },
  [reducedMotion]: { transition: 'none' },
})

const NodeName = styled('span', {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  fontFamily: '$serif',
  fontSize: '14px',
  color: '$stInk',
  whiteSpace: 'nowrap',
  maxWidth: '150px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  pointerEvents: 'none',
})

const Card = styled('aside', {
  borderLeft: '1px solid $stLine',
  background: '$stSurface',
  padding: '18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
  '@mdDown': {
    borderLeft: 'none',
    borderTop: '1px solid $stLine',
    padding: '14px 16px 16px',
  },
})

const CardName = styled('button', {
  all: 'unset',
  cursor: 'pointer',
  fontFamily: '$serif',
  fontSize: '28px',
  fontWeight: 500,
  lineHeight: 1.05,
  color: '$stInk',
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '@mdDown': { fontSize: '24px' },
})

const Led = styled('ul', {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: '7px',
  li: {
    display: 'grid',
    gridTemplateColumns: '18px minmax(0, 1fr) 70px auto',
    gap: '8px',
    alignItems: 'center',
    fontSize: '$caption',
    color: '$stInk2',
  },
  'li > span:nth-child(2)': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})

const Bar = styled('span', {
  height: '4px',
  borderRadius: '2px',
  background: '$stLine',
  overflow: 'hidden',
  '& > i': {
    display: 'block',
    height: '100%',
    borderRadius: '2px',
    background: '$stAccent',
  },
})

const Latest = styled('div', {
  display: 'grid',
  gap: '4px',
  paddingTop: '10px',
  borderTop: '1px solid $stLine',
  fontFamily: '$serif',
  fontSize: '15px',
  lineHeight: 1.3,
  color: '$stInk',
})

const CardActs = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginTop: 'auto',
})

function GuideIcon(props: { guide: MapGuide; size: number }): JSX.Element {
  const { guide, size } = props
  if (guide.kind == 'save') return <BookmarkSimple size={size * 0.55} />
  if (guide.kind == 'writer') return <PenNib size={size * 0.55} />
  return (
    <SiteIcon
      src={guideIcon(guide.reason)}
      name={guide.name}
      size={size - 6}
      round
    />
  )
}

const pct = (n: number, of: number) => `${(n / of) * 100}%`

function MapCanvas(props: {
  suggestions: FeedSuggestion[]
  shape: MapShape
  labels: boolean
  selected?: string
  onSelect: (id: string) => void
}): JSX.Element | null {
  const { shape } = props
  const { guides, nodes, edges } = useMemo(
    () => layoutReadingMap(props.suggestions, shape),
    [props.suggestions, shape]
  )
  const cx = shape.width / 2
  const cy = shape.height / 2
  const guideSize = props.labels ? 30 : 24
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Arrow keys walk round the ring.
  const step = (i: number, by: number) => {
    const next = (i + by + nodes.length) % nodes.length
    nodeRefs.current[next]?.focus()
  }

  return (
    <Canvas
      style={{
        aspectRatio: `${shape.width} / ${shape.height}`,
        maxWidth: shape.width,
      }}
    >
      <Lines viewBox={`0 0 ${shape.width} ${shape.height}`} aria-hidden="true">
        <ellipse
          className="ring"
          cx={cx}
          cy={cy}
          rx={shape.inner}
          ry={shape.inner * 0.82}
        />
        <ellipse
          className="ring"
          cx={cx}
          cy={cy}
          rx={shape.outerX}
          ry={shape.outerY}
        />
        {guides.map((g) => (
          <line
            key={g.key}
            className="spoke"
            x1={cx}
            y1={cy}
            x2={g.x}
            y2={g.y}
          />
        ))}
        {edges.map((e) => (
          <path
            key={`${e.from.key}-${e.to.s.id}`}
            className="edge"
            d={e.path}
            strokeWidth={0.9 + e.strength * 2.6}
            data-hot={
              props.selected ? String(e.to.s.id == props.selected) : undefined
            }
          />
        ))}
      </Lines>

      <You
        small={!props.labels}
        style={{ left: pct(cx, shape.width), top: pct(cy, shape.height) }}
        aria-hidden="true"
      >
        You
      </You>

      {guides.map((g) => (
        <GuideDot
          key={g.key}
          title={g.name}
          style={{
            left: pct(g.x, shape.width),
            top: pct(g.y, shape.height),
            width: guideSize,
            height: guideSize,
          }}
        >
          <GuideIcon guide={g} size={guideSize} />
          {props.labels && (
            <GuideName
              style={
                g.above ? { bottom: guideSize + 4 } : { top: guideSize + 4 }
              }
            >
              {g.name}
            </GuideName>
          )}
        </GuideDot>
      ))}

      {nodes.map((n, i) => {
        const selected = n.s.id == props.selected
        return (
          <Node
            key={n.s.id}
            ref={(el) => {
              nodeRefs.current[i] = el
            }}
            type="button"
            aria-label={`${n.s.title}, ${whyLine(n.s)}`}
            aria-pressed={selected}
            data-selected={selected}
            data-dim={props.selected ? !selected : undefined}
            style={{
              left: pct(n.x, shape.width),
              top: pct(n.y, shape.height),
              width: n.size,
              height: n.size,
            }}
            onMouseEnter={() => props.onSelect(n.s.id)}
            onFocus={() => props.onSelect(n.s.id)}
            onClick={() => props.onSelect(n.s.id)}
            onKeyDown={(e) => {
              if (e.key == 'ArrowRight' || e.key == 'ArrowDown') {
                e.preventDefault()
                step(i, 1)
              } else if (e.key == 'ArrowLeft' || e.key == 'ArrowUp') {
                e.preventDefault()
                step(i, -1)
              }
            }}
          >
            <SiteIcon
              src={iconFor(n.s)}
              fallbackSrc={fallbackIconFor(n.s)}
              name={n.s.title}
              size={Math.round(n.size * 0.56)}
              round
            />
            {props.labels && (
              <NodeName
                style={n.right ? { left: n.size + 8 } : { right: n.size + 8 }}
              >
                {n.s.title}
              </NodeName>
            )}
          </Node>
        )
      })}
    </Canvas>
  )
}

export function ReadingMap(props: {
  suggestions: FeedSuggestion[]
  onOpen: (s: FeedSuggestion) => void
  onFollow: (s: FeedSuggestion, from: HTMLElement | null) => void
  onTry: (s: FeedSuggestion) => void
}): JSX.Element | null {
  const placed = useMemo(
    () => layoutReadingMap(props.suggestions, MAC_MAP).nodes.map((n) => n.s),
    [props.suggestions]
  )
  const [chosen, setChosen] = useState<string>()
  const iconRef = useRef<HTMLSpanElement>(null)
  if (placed.length < 3) return null

  const s =
    placed.find((x) => x.id == chosen) ??
    [...placed].sort((a, b) => b.score - a.score)[0]
  const led = [...s.reasons]
    .sort((a, b) => reasonStrength(b) - reasonStrength(a))
    .slice(0, 4)

  return (
    <Root aria-label="Your reading map">
      <MapArea only="mac">
        <MapTitle>
          <b>Your reading map</b>
          <Label css={{ fontSize: '9.5px', textTransform: 'none' }}>
            Line weight shows how strongly a feed points there
          </Label>
        </MapTitle>
        <MapCanvas
          suggestions={props.suggestions}
          shape={MAC_MAP}
          labels
          selected={s.id}
          onSelect={setChosen}
        />
        <Legend>
          <Label>
            <i style={{ boxShadow: 'inset 0 0 0 1.5px currentColor' }} />
            You follow
          </Label>
          <Label css={{ color: '$stAccentText' }}>
            <i style={{ boxShadow: 'inset 0 0 0 1.5px currentColor' }} />
            Suggested
          </Label>
        </Legend>
      </MapArea>
      <MapArea only="phone">
        <MapCanvas
          suggestions={props.suggestions}
          shape={PHONE_MAP}
          labels={false}
          selected={s.id}
          onSelect={setChosen}
        />
      </MapArea>

      <Card aria-live="polite">
        <Label>
          {s.status == 'NEW' ? 'Suggested' : 'From Discover'} ·{' '}
          {matchPercent(s)}% match
        </Label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span ref={iconRef} style={{ display: 'inline-flex' }}>
            <SiteIcon
              src={iconFor(s)}
              fallbackSrc={fallbackIconFor(s)}
              name={s.title}
              size={24}
            />
          </span>
          <CardName onClick={() => props.onOpen(s)}>{s.title}</CardName>
        </div>
        <Why>{whyLine(s)}</Why>
        <div style={{ display: 'grid', gap: 7 }}>
          <Label>Who led you here</Label>
          <Led>
            {led.map((r) => (
              <li key={`${r.kind}-${r.guide}`}>
                {r.kind == 'save' ? (
                  <BookmarkSimple size={16} />
                ) : r.kind == 'writer' ? (
                  <PenNib size={16} />
                ) : (
                  <SiteIcon
                    src={guideIcon(r)}
                    name={r.guideName}
                    size={18}
                    round
                  />
                )}
                <span>
                  {r.kind == 'save'
                    ? 'Your saves'
                    : r.kind == 'neighbour' || r.kind == 'similar'
                    ? `Like ${r.guideName}`
                    : r.guideName}
                </span>
                <Bar>
                  <i style={{ width: `${reasonStrength(r) * 100}%` }} />
                </Bar>
                <Label css={{ textTransform: 'none' }}>{reasonAmount(r)}</Label>
              </li>
            ))}
          </Led>
        </div>
        {s.latest[0] && (
          <Latest>
            <Label>Latest</Label>
            {s.latest[0].title}
          </Latest>
        )}
        <CardActs>
          {s.status == 'NEW' ? (
            <>
              <Button tone="accent" onClick={() => props.onTry(s)}>
                Try a week
              </Button>
              <Button
                tone="primary"
                onClick={() => props.onFollow(s, iconRef.current)}
              >
                Follow
              </Button>
            </>
          ) : (
            <Chip accent>
              {s.status == 'TRIAL' ? 'Trying this week' : 'Following'}
            </Chip>
          )}
          <Button tone="quiet" onClick={() => props.onOpen(s)}>
            Read a sample
          </Button>
        </CardActs>
      </Card>
    </Root>
  )
}
