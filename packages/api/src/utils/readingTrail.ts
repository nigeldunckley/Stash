// A reading trail is the parts of an article that were actually read,
// as ranges in thousandths of its length: "0-120,300-410".

export type TrailRange = [number, number]

const MAX_RANGES = 200

export const parseTrail = (trail?: string | null): TrailRange[] | undefined => {
  if (!trail) return []
  const ranges: TrailRange[] = []
  for (const part of trail.split(',')) {
    const match = /^(\d{1,4})-(\d{1,4})$/.exec(part.trim())
    if (!match) return undefined
    const start = Number(match[1])
    const end = Number(match[2])
    if (start > end || end > 1000) return undefined
    ranges.push([start, end])
  }
  return ranges.length > MAX_RANGES ? undefined : ranges
}

// Sorted, with touching or overlapping ranges joined.
export const mergeTrail = (...trails: TrailRange[][]): TrailRange[] => {
  const all = trails.flat().sort((a, b) => a[0] - b[0])
  const out: TrailRange[] = []
  for (const [start, end] of all) {
    const last = out[out.length - 1]
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end)
    else out.push([start, end])
  }
  return out
}

export const formatTrail = (ranges: TrailRange[]): string =>
  ranges.map(([start, end]) => `${start}-${end}`).join(',')
