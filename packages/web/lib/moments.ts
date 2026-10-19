// Saving, archiving, trashing and filing, made physical. Each calls
// announceMoment() from the few places that actually do it. The item's row
// then sweeps into its place in the navigation (Saved, Archive, Trash or a
// collection), which takes it in with a small settle, and an optional sound
// plays. Undo never announces.
//
// The row the action came from is found from the last thing pressed or
// focused, so callers don't have to pass it along.

export type MomentKind = 'saved' | 'archived' | 'trashed' | 'collected'

// Sent on window when the item arrives (straight away when nothing flies).
export const MOMENT_LANDED = 'stash:moment-landed'

export type MomentLanded = {
  kind: MomentKind
  // Which navigation entry it landed on: 'saved', 'watch-saved', 'archived',
  // 'trash' or 'collection-<id>'.
  target: string
}

export const SOUNDS_KEY = 'stash-sounds'

// Rows, and the boxes you paste a link into.
const ROW = '[data-stash-row], [data-moment-source]'
// How long after a press its row still counts as where an action came from.
const ORIGIN_FOR_MS = 8000

let lastRow: { element: Element; at: number } | undefined
let listening = false

const remember = (event: Event) => {
  const target = event.target as Element | null
  const row = target?.closest?.(ROW)
  if (row) {
    lastRow = { element: row, at: Date.now() }
  }
}

const listen = () => {
  if (listening || typeof window === 'undefined') return
  listening = true
  for (const type of ['pointerdown', 'contextmenu', 'focusin']) {
    window.addEventListener(type, remember, { capture: true, passive: true })
  }
}
listen()

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const originRow = (): HTMLElement | undefined => {
  const focused = document.activeElement?.closest?.(ROW)
  if (focused instanceof HTMLElement && focused.isConnected) return focused
  if (
    lastRow &&
    lastRow.element instanceof HTMLElement &&
    lastRow.element.isConnected &&
    Date.now() - lastRow.at < ORIGIN_FOR_MS
  ) {
    return lastRow.element
  }
  return undefined
}

// Whether a scrolling container (the sidebar, when it holds many
// collections) has scrolled the entry out of view.
const clipped = (element: HTMLElement, rect: DOMRect): boolean => {
  const middle = rect.top + rect.height / 2
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const overflow = getComputedStyle(parent).overflowY
    if (overflow == 'visible') continue
    const box = parent.getBoundingClientRect()
    if (middle < box.top || middle > box.bottom) return true
  }
  return false
}

// A navigation entry counts only while it is on screen (the sidebar on Mac,
// the top bar on iPhone, which hides as you scroll).
const visibleTarget = (name: string): HTMLElement | undefined => {
  for (const element of Array.from(
    document.querySelectorAll<HTMLElement>(`[data-moment-target="${name}"]`)
  )) {
    const rect = element.getBoundingClientRect()
    if (
      rect.width == 0 ||
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= window.innerWidth ||
      rect.top >= window.innerHeight ||
      clipped(element, rect) ||
      getComputedStyle(element).visibility == 'hidden'
    ) {
      continue
    }
    return element
  }
  return undefined
}

const watching = () => window.location.pathname.startsWith('/l/watch')

const targetFor = (kind: MomentKind): string => {
  if (kind == 'archived') return 'archived'
  if (kind == 'trashed') return 'trash'
  return watching() ? 'watch-saved' : 'saved'
}

// Where to go when the entry itself isn't on screen: on iPhone, Saved is a
// pill under Read or Watch, and Archive and Trash live behind More.
const fallbacksFor = (target: string): string[] => {
  if (target == 'saved') return ['tab-read']
  if (target == 'watch-saved' || target.startsWith('collection-')) {
    return ['watch-saved', 'tab-watch']
  }
  return ['more']
}

const land = (kind: MomentKind, target: string) => {
  window.dispatchEvent(
    new CustomEvent<MomentLanded>(MOMENT_LANDED, { detail: { kind, target } })
  )
}

const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

// ---------------------------------------------------------------------------
// The swoosh. A copy of the row lifts off the list, sweeps along a curve to
// the navigation entry, tilting and shrinking to a sliver as it goes, with a
// fine accent trail behind it, and is drawn into the entry, which gives a
// small settle. Rows that leave the list close the gap behind them.

const LIFT_MS = 90
const TRAVEL_MS = 470
// Slow out of the lift, fast through the middle, drawn in at the end.
const SWEEP = 'cubic-bezier(0.55, 0.05, 0.25, 1)'
const STEPS = 24

type Point = { x: number; y: number }

const bezier = (a: Point, c: Point, b: Point, u: number): Point => ({
  x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
  y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y,
})

const centre = (rect: DOMRect): Point => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
})

// Where in the entry the item goes: its icon, when it has one.
const slotFor = (target: HTMLElement): Point => {
  const icon = target.querySelector('svg')
  const rect = icon?.getBoundingClientRect()
  if (rect && rect.width > 0) return centre(rect)
  return centre(target.getBoundingClientRect())
}

const ghostOf = (row: HTMLElement, rect: DOMRect): HTMLElement => {
  const ghost = row.cloneNode(true) as HTMLElement
  for (const element of [ghost, ...Array.from(ghost.querySelectorAll('*'))]) {
    element.removeAttribute('id')
    element.removeAttribute('data-stash-row')
    element.removeAttribute('data-morph-title')
    element.removeAttribute('data-moment-source')
  }
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('inert', '')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    zIndex: '1000',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    overflow: 'hidden',
    background: css('--colors-stSurface'),
    border: `1px solid ${css('--colors-stLine')}`,
    borderRadius: '10px',
    transformOrigin: 'center',
    willChange: 'transform, opacity, filter',
    visibility: 'visible',
  } as Partial<CSSStyleDeclaration>)
  document.body.appendChild(ghost)
  return ghost
}

const SVG = 'http://www.w3.org/2000/svg'

// A fine accent line that follows the item like a comet's tail.
const trailFor = (a: Point, c: Point, b: Point): SVGSVGElement => {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  Object.assign(svg.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '999',
    pointerEvents: 'none',
    overflow: 'visible',
  })
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', css('--colors-stAccent') || '#FF4F00')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linecap', 'round')
  svg.appendChild(path)
  document.body.appendChild(svg)
  return svg
}

const sweep = async (
  row: HTMLElement,
  target: HTMLElement,
  leaves: boolean
): Promise<void> => {
  const from = row.getBoundingClientRect()
  const start = centre(from)
  const end = slotFor(target)
  const dx = end.x - start.x
  // The curve rises before it falls into the entry, more so for long trips.
  const control = {
    x: start.x + dx * 0.3,
    // Kept on screen when the entry is at the top, as on iPhone.
    y: Math.max(16, Math.min(start.y, end.y) - 70 - Math.abs(dx) * 0.08),
  }
  const endScale = Math.max(0.04, 36 / Math.max(from.width, 1))
  const tilt = dx < 0 ? -5 : 5

  const ghost = ghostOf(row, from)
  if (leaves) row.style.visibility = 'hidden'

  const raised = '0 18px 40px -12px rgba(9, 9, 11, 0.32)'
  const lift = ghost.animate(
    [
      { transform: 'scale(1)', boxShadow: '0 0 0 rgba(9, 9, 11, 0)' },
      { transform: 'scale(1.025) translateY(-3px)', boxShadow: raised },
    ],
    {
      duration: LIFT_MS,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      fill: 'forwards',
    }
  )
  await lift.finished.catch(() => undefined)

  const frames: Keyframe[] = []
  for (let i = 0; i <= STEPS; i++) {
    const u = i / STEPS
    const at = bezier(start, control, end, u)
    // Holds its size through the lift of the curve, then is drawn in.
    const scale = 1.025 + (endScale - 1.025) * Math.pow(u, 1.7)
    const rotate = tilt * Math.sin(Math.PI * Math.min(u * 1.15, 1))
    frames.push({
      offset: u,
      transform: `translate(${at.x - start.x}px, ${
        at.y - start.y - 3 * (1 - u)
      }px) rotate(${rotate}deg) scale(${scale})`,
      filter: `blur(${(1.4 * Math.sin(Math.PI * u)).toFixed(2)}px)`,
      opacity: u < 0.82 ? 1 : 1 - (u - 0.82) / 0.18,
      boxShadow: raised,
    })
  }
  const travel = ghost.animate(frames, {
    duration: TRAVEL_MS,
    easing: SWEEP,
    fill: 'forwards',
  })

  const trail = trailFor(start, control, end)
  const path = trail.firstChild as SVGPathElement
  const length = path.getTotalLength()
  const tail = Math.min(140, length * 0.4)
  path.setAttribute('stroke-dasharray', `${tail} ${length + tail}`)
  path.animate(
    [
      { strokeDashoffset: tail, opacity: 0 },
      { strokeDashoffset: tail - length * 0.5, opacity: 0.7, offset: 0.5 },
      { strokeDashoffset: tail - length, opacity: 0 },
    ],
    { duration: TRAVEL_MS, easing: SWEEP, fill: 'forwards' }
  )

  await travel.finished.catch(() => undefined)
  ghost.remove()
  trail.remove()
  settle(target)
  // If the row is still here (an undo, or the save didn't remove it),
  // bring it back.
  if (leaves) {
    setTimeout(() => {
      if (row.isConnected) row.style.visibility = ''
    }, 900)
  }
}

// The entry takes the item in: a brief accent wash and a small give.
const settle = (target: HTMLElement) => {
  const wash = `color-mix(in srgb, ${
    css('--colors-stAccent') || '#FF4F00'
  } 14%, transparent)`
  target.animate(
    [
      { backgroundColor: wash, transform: 'scale(0.97)' },
      { transform: 'scale(1.015)', offset: 0.45 },
      { transform: 'scale(1)' },
    ],
    { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
  )
}

// When the row leaves the list, the rows below slide up into its place
// rather than jumping.
const closeGap = (row: HTMLElement) => {
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>('[data-stash-row], [data-story]')
  ).filter((element) => element != row)
  const before = new Map(
    rows.map((element) => [element, element.getBoundingClientRect()])
  )
  let done = false
  const finish = () => {
    if (done) return
    done = true
    observer.disconnect()
    clearTimeout(timer)
  }
  const observer = new MutationObserver(() => {
    if (row.isConnected) return
    finish()
    requestAnimationFrame(() => {
      for (const [element, was] of Array.from(before.entries())) {
        if (!element.isConnected) continue
        const now = element.getBoundingClientRect()
        const x = was.left - now.left
        const y = was.top - now.top
        if (Math.abs(x) < 1 && Math.abs(y) < 1) continue
        if (now.bottom < 0 || now.top > window.innerHeight) continue
        element.animate(
          [
            { transform: `translate(${x}px, ${y}px)` },
            { transform: 'translate(0, 0)' },
          ],
          { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
        )
      }
    })
  })
  observer.observe(document.body, { childList: true, subtree: true })
  const timer = setTimeout(finish, 2500)
}

// Saving and archiving (and trashing, and filing a video in a collection)
// call this from the few places that actually do it. Pass `target` for an
// entry other than the kind's own, such as a collection.
export function announceMoment(
  kind: MomentKind,
  title?: string,
  target?: string
): void {
  if (typeof window === 'undefined') return
  playMomentSound(kind)
  const name = target ?? targetFor(kind)
  const row = originRow()
  const to =
    visibleTarget(name) ??
    fallbacksFor(name)
      .map(visibleTarget)
      .find((element) => element)
  if (!row || !to || reducedMotion()) {
    land(kind, name)
    return
  }
  const leaves = kind != 'saved' && kind != 'collected'
  if (leaves) closeGap(row)
  void sweep(row, to, leaves).then(() => land(kind, name))
}

// ---------------------------------------------------------------------------
// Sounds: off unless turned on in Settings › Account › This device. Both are
// made on the fly from a little filtered noise, so there's nothing to load.

let audio: AudioContext | undefined

export const soundsOn = (): boolean => {
  try {
    return JSON.parse(localStorage.getItem(SOUNDS_KEY) ?? 'false') === true
  } catch {
    return false
  }
}

const noise = (context: AudioContext, seconds: number) => {
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * seconds),
    context.sampleRate
  )
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const source = context.createBufferSource()
  source.buffer = buffer
  return source
}

const burst = (
  context: AudioContext,
  at: number,
  length: number,
  filter: BiquadFilterType,
  frequency: number,
  level: number
) => {
  const source = noise(context, length)
  const shape = context.createBiquadFilter()
  shape.type = filter
  shape.frequency.value = frequency
  shape.Q.value = 0.8
  const gain = context.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(level, at + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  source.connect(shape).connect(gain).connect(context.destination)
  source.start(at)
  source.stop(at + length)
}

export function playMomentSound(kind: MomentKind, force = false): void {
  if (typeof window === 'undefined' || (!force && !soundsOn())) return
  try {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Context) return
    audio = audio ?? new Context()
    if (audio.state == 'suspended') void audio.resume()
    const now = audio.currentTime + 0.01
    if (kind == 'saved' || kind == 'collected') {
      // A soft paper slip.
      burst(audio, now, 0.09, 'bandpass', 3800, 0.05)
    } else {
      // A drawer closing: a low push, then a small click as it shuts.
      burst(audio, now, 0.06, 'lowpass', 420, 0.12)
      burst(audio, now + 0.025, 0.012, 'highpass', 2500, 0.04)
    }
  } catch {
    // Sound is a nicety; never let it get in the way.
  }
}
