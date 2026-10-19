// Saving and archiving, made physical. Every save or archive in Stash calls
// announceMoment(), from the few places that actually save or archive. A
// small card of the item then travels to Saved or Archive in the sidebar,
// which answers with a dip or a tick when it lands, and an optional sound
// plays. Undo never announces.
//
// The row the action came from is found from the last thing pressed or
// focused, so callers don't have to pass it along.

export type MomentKind = 'saved' | 'archived'

// Sent on window when the card arrives (straight away when nothing flies).
export const MOMENT_LANDED = 'stash:moment-landed'

export type MomentLanded = {
  kind: MomentKind
  // Which sidebar row it landed on: 'saved', 'watch-saved' or 'archived'.
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

const originRow = (): Element | undefined => {
  const focused = document.activeElement?.closest?.(ROW)
  if (focused?.isConnected) return focused
  if (
    lastRow &&
    lastRow.element.isConnected &&
    Date.now() - lastRow.at < ORIGIN_FOR_MS
  ) {
    return lastRow.element
  }
  return undefined
}

// A sidebar row counts only while the sidebar is on screen.
const visibleTarget = (name: string): HTMLElement | undefined => {
  const element = document.querySelector<HTMLElement>(
    `[data-moment-target="${name}"]`
  )
  if (!element) return undefined
  const rect = element.getBoundingClientRect()
  if (rect.width == 0 || rect.right <= 0 || rect.left >= window.innerWidth) {
    return undefined
  }
  if (getComputedStyle(element).visibility == 'hidden') return undefined
  return element
}

const targetFor = (kind: MomentKind): string => {
  if (kind == 'archived') return 'archived'
  return window.location.pathname.startsWith('/l/watch')
    ? 'watch-saved'
    : 'saved'
}

const land = (kind: MomentKind, target: string) => {
  window.dispatchEvent(
    new CustomEvent<MomentLanded>(MOMENT_LANDED, { detail: { kind, target } })
  )
}

const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const ghostFor = (rect: DOMRect, title: string): HTMLDivElement => {
  const ghost = document.createElement('div')
  ghost.setAttribute('aria-hidden', 'true')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: '1000',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    fontFamily: css('--fonts-serif') || 'serif',
    fontSize: '13px',
    fontWeight: '500',
    color: css('--colors-stInk'),
    background: css('--colors-stSurface'),
    border: `1px solid ${css('--colors-stLineStrong')}`,
    borderRadius: '6px',
    boxShadow: '0 6px 16px rgba(9, 9, 11, 0.12)',
    transformOrigin: 'left center',
  } as Partial<CSSStyleDeclaration>)
  ghost.textContent = title
  document.body.appendChild(ghost)
  return ghost
}

const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)'
const EASE = 'cubic-bezier(0.2, 0, 0, 1)'

// A small card of the item drops into Saved.
const flySave = async (from: DOMRect, title: string, to: DOMRect) => {
  const width = Math.min(Math.max(from.width - 24, 120), 320)
  const start = new DOMRect(
    from.left + 12,
    from.top + from.height / 2 - 18,
    width,
    36
  )
  const ghost = ghostFor(start, title)
  const dx = to.left + 18 - start.left
  const dy = to.top + to.height / 2 - (start.top + 18)
  const animation = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      {
        transform: `translate(${dx * 0.55}px, ${dy * 0.45 - 28}px) scale(0.6)`,
        opacity: 1,
        offset: 0.55,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 },
    ],
    { duration: 360, easing: SPRING, fill: 'forwards' }
  )
  await animation.finished.catch(() => undefined)
  ghost.remove()
}

// The row folds flat into an ink line, which files itself into Archive.
const flyArchive = async (from: DOMRect, title: string, to: DOMRect) => {
  const ghost = ghostFor(from, title)
  ghost.style.borderRadius = '0'
  ghost.style.boxShadow = 'none'
  const ink = css('--colors-stInk')
  const fold = ghost.animate(
    [
      { height: `${from.height}px`, top: `${from.top}px` },
      {
        height: '1px',
        top: `${from.top + from.height / 2}px`,
        background: ink,
        borderColor: ink,
        color: 'transparent',
        padding: '0',
      },
    ],
    { duration: 160, easing: EASE, fill: 'forwards' }
  )
  await fold.finished.catch(() => undefined)
  const y = from.top + from.height / 2
  const travel = ghost.animate(
    [
      { transform: 'translate(0, 0) scaleX(1)', opacity: 1 },
      {
        transform: `translate(${to.left + 16 - from.left}px, ${
          to.top + to.height / 2 - y
        }px) scaleX(${40 / from.width})`,
        opacity: 0.2,
      },
    ],
    { duration: 220, easing: SPRING, fill: 'forwards' }
  )
  await travel.finished.catch(() => undefined)
  ghost.remove()
}

export function announceMoment(kind: MomentKind, title?: string): void {
  if (typeof window === 'undefined') return
  playMomentSound(kind)
  const target = targetFor(kind)
  const row = originRow()
  const to = visibleTarget(target)
  if (!row || !to || reducedMotion()) {
    land(kind, target)
    return
  }
  const from = row.getBoundingClientRect()
  const name =
    title ?? row.querySelector('.row-title')?.textContent?.trim() ?? ''
  const fly = kind == 'saved' ? flySave : flyArchive
  void fly(from, name, to.getBoundingClientRect()).then(() =>
    land(kind, target)
  )
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
    if (kind == 'saved') {
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
