import {
  FeedSuggestion,
  FeedSuggestionReason,
} from '../../../lib/networking/feedSuggestions'

// Lays out the reading map: you in the middle, the feeds that led somewhere
// on an inner ring, and the suggestions they led to on an outer ring. Each
// suggestion sits near the feeds that point at it, so lines rarely cross.

export type MapGuide = {
  key: string
  name: string
  kind: FeedSuggestionReason['kind']
  // A reason to show its favicon: link and neighbour guides are feed URLs.
  reason: FeedSuggestionReason
  x: number
  y: number
  above: boolean
}

export type MapNode = {
  s: FeedSuggestion
  x: number
  y: number
  size: number
  right: boolean
}

export type MapEdge = {
  from: MapGuide
  to: MapNode
  strength: number
  path: string
}

export type MapShape = {
  width: number
  height: number
  inner: number
  outerX: number
  outerY: number
  // Pixel sizes of the suggestion dots, smallest to largest.
  dot: [number, number]
}

export const MAC_MAP: MapShape = {
  width: 840,
  height: 420,
  inner: 104,
  outerX: 236,
  outerY: 158,
  dot: [26, 46],
}

export const PHONE_MAP: MapShape = {
  width: 360,
  height: 240,
  inner: 54,
  outerX: 140,
  outerY: 92,
  dot: [22, 34],
}

const MAX_GUIDES = 6
const MAX_NODES = 8

// Saves and writers aren't feeds you follow, so each kind gets one shared
// node instead of one per site or byline.
const guideKey = (r: FeedSuggestionReason) =>
  r.kind == 'save' ? '@saves' : r.kind == 'writer' ? '@writers' : r.guide

const guideName = (r: FeedSuggestionReason) =>
  r.kind == 'save'
    ? 'Your saves'
    : r.kind == 'writer'
    ? 'Writers you finish'
    : r.guideName

// How strongly a reason ties a feed to a suggestion, from 0 to 1. Neighbour
// counts are an overlap percentage; a blogroll is a recommendation outright;
// the rest are counts of pieces.
export const reasonStrength = (r: FeedSuggestionReason): number =>
  r.kind == 'similar'
    ? 0.65
    : r.kind == 'neighbour'
    ? Math.min(1, r.count / 100) * 0.6
    : r.kind == 'blogroll'
    ? 0.8
    : Math.min(1, r.count / 5)

export const reasonAmount = (r: FeedSuggestionReason): string => {
  switch (r.kind) {
    case 'link':
      return `${r.count}×`
    case 'neighbour':
      return `${r.count}%`
    case 'similar':
      return 'Similar'
    case 'save':
      return `${r.count} saved`
    case 'writer':
      return `${r.count} read`
    case 'blogroll':
      return 'Blogroll'
    case 'starter':
      return ''
  }
}

const angleGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % (2 * Math.PI)
  return d > Math.PI ? 2 * Math.PI - d : d
}

export function layoutReadingMap(
  suggestions: FeedSuggestion[],
  shape: MapShape
): { guides: MapGuide[]; nodes: MapNode[]; edges: MapEdge[] } {
  // Starting points weren't led to by anything you read.
  const picked = suggestions
    .filter((s) => s.reasons.length && s.reasons[0].kind != 'starter')
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_NODES)

  // The feeds that did the most leading, by the strength of what they led to.
  const weight = new Map<string, number>()
  const first = new Map<string, FeedSuggestionReason>()
  for (const s of picked) {
    for (const r of s.reasons) {
      const key = guideKey(r)
      weight.set(key, (weight.get(key) ?? 0) + reasonStrength(r) * s.score)
      if (!first.has(key)) first.set(key, r)
    }
  }
  const keys = [...weight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_GUIDES)
    .map(([key]) => key)

  const cx = shape.width / 2
  const cy = shape.height / 2
  const guides: MapGuide[] = keys.map((key, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / keys.length + 0.3
    const reason = first.get(key) as FeedSuggestionReason
    const y = cy + Math.sin(angle) * shape.inner * 0.82
    return {
      key,
      name: guideName(reason),
      kind: reason.kind,
      reason,
      x: cx + Math.cos(angle) * shape.inner,
      y,
      above: y < cy,
    }
  })
  const guideAngle = new Map(
    guides.map((g) => [g.key, Math.atan2((g.y - cy) / 0.82, g.x - cx)])
  )

  // Point each suggestion at the average direction of its guides, then
  // spread them evenly around the outer ring in that order.
  const linked = picked.filter((s) =>
    s.reasons.some((r) => guideAngle.has(guideKey(r)))
  )
  const aim = new Map(
    linked.map((s) => {
      let x = 0
      let y = 0
      for (const r of s.reasons) {
        const a = guideAngle.get(guideKey(r))
        if (a === undefined) continue
        x += Math.cos(a) * reasonStrength(r)
        y += Math.sin(a) * reasonStrength(r)
      }
      return [s.id, Math.atan2(y, x)]
    })
  )
  const ordered = [...linked].sort(
    (a, b) => (aim.get(a.id) ?? 0) - (aim.get(b.id) ?? 0)
  )
  const step = (2 * Math.PI) / Math.max(1, ordered.length)
  // Turn the whole ring so the suggestions land as close to their aim as
  // they can.
  let offset = 0
  let best = Infinity
  for (let k = 0; k < 24; k++) {
    const o = (k * step) / 24
    const miss = ordered.reduce(
      (sum, s, i) =>
        sum + angleGap(-Math.PI + o + i * step, aim.get(s.id) ?? 0),
      0
    )
    if (miss < best) {
      best = miss
      offset = o
    }
  }

  const [small, large] = shape.dot
  const top = picked[0]?.score || 1
  const nodes: MapNode[] = ordered.map((s, i) => {
    const angle = -Math.PI + offset + i * step
    const x = cx + Math.cos(angle) * shape.outerX
    return {
      s,
      x,
      y: cy + Math.sin(angle) * shape.outerY,
      size: Math.round(small + (large - small) * Math.min(1, s.score / top)),
      right: x >= cx,
    }
  })

  const byKey = new Map(guides.map((g) => [g.key, g]))
  const edges: MapEdge[] = []
  for (const node of nodes) {
    for (const r of node.s.reasons) {
      const from = byKey.get(guideKey(r))
      if (!from || edges.some((e) => e.from == from && e.to == node)) continue
      // A gentle curve, bowed away from the middle.
      const mx = (from.x + node.x) / 2 + (cy - (from.y + node.y) / 2) * 0.15
      const my = (from.y + node.y) / 2 + ((from.x + node.x) / 2 - cx) * 0.15
      edges.push({
        from,
        to: node,
        strength: reasonStrength(r),
        path: `M${from.x},${from.y} Q${mx},${my} ${node.x},${node.y}`,
      })
    }
  }
  return { guides, nodes, edges }
}
