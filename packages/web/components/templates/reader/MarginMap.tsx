import {
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { styled } from '../../tokens/stitches.config'
import { Ribbon } from '../../elements/stash/Ribbon'
import { formatMinutes, readingMinutes } from '../../../lib/readingTime'
import {
  CONTENTS_EVENT,
  SECTIONS_EVENT,
  SectionsDetail,
  sectionNumber,
  shortNames,
  tick,
} from '../../../lib/readerSections'

// The margin map: the whole article drawn small down the right edge of the
// window. Every paragraph is a few hairlines, headings get tiny numbered
// labels, pictures are tiny copies of themselves (grey until you pass them)
// and your highlights are orange ticks you can read on hover. A
// bracket shows the screen you're on, and a running head above names the
// section you're in. Rest the pointer on it and it unfolds into contents;
// click or drag to travel.
//
// The map darkens only what you've actually read: a part counts once it
// has been on screen long enough to read, so sections you jump past stay
// pale and the foot offers to take you back. The trail is kept with the
// article, so it's the same on every device.
//
// On a wide window it is always there. On a phone, touch and hold near the
// right edge and it slides in as a drawer with its labels; drag to scrub,
// with a bubble naming the section and a tick at each heading. A quick
// flick brings up the small map too. The contents open as a sheet from the
// reader's top bar.

// Width the map takes from the right margin, so margin notes and pull
// quotes can leave room for it.
export const MAP_ROOM = 108
const WIDE = 1100
const PHONE = 760
const WIDTH = 56
const LINE_GAP = 3
// How far down the screen counts as "where you're reading".
const EYE = 0.3
// On a phone: how close to the right edge, and how long, to call the drawer.
const EDGE = 28
const HOLD = 280
// How long the drawer stays after you let go.
const LINGER = 1200

// The trail, in thousandths of the article's length.
const STEPS = 1000
// Reading speed in words a second, and how much of a screen's reading time
// it must stay up before it counts as read (skimming is reading too).
const WORDS_A_SECOND = 4.2
const ENOUGH = 0.35

const BLOCKS =
  'p, h1, h2, h3, h4, blockquote, figure, img, pre, ul, ol, table, iframe, video'

type Block = {
  kind: 'text' | 'heading' | 'picture' | 'embed' | 'quote'
  top: number
  height: number
  // Pictures: the image, its share of the column's width, and its caption.
  src?: string
  width?: number
  caption?: string
  label?: string
  preview: string
  words: number
}

type Highlight = {
  id: string
  top: number
  quote: string
  hasNote: boolean
}

type Shape = {
  blocks: Block[]
  highlights: Highlight[]
  height: number
}

type Section = {
  // 0 for the opening before the first heading.
  number: number
  label: string
  short: string
  top: number
  end: number
  words: number
  highlights: number
  preview: string
}

// Whether the map is showing in the margin at this window width.
export const marginMapShown = (): boolean =>
  typeof window !== 'undefined' &&
  window.innerWidth >= WIDE &&
  document.body.dataset.notebook != 'open'

const Root = styled('div', {
  position: 'fixed',
  top: '84px',
  // Leaves room for labels that run past the map's right edge.
  right: '30px',
  width: `${WIDTH}px`,
  zIndex: 3,
  userSelect: 'none',
  transition: 'opacity 240ms cubic-bezier(0.2, 0, 0, 1)',
  '@media print': { display: 'none' },
  '&[data-phone]': {
    right: '6px',
    top: '92px',
    width: '34px',
    padding: '8px 6px',
    background: '$stSurface',
    border: '1px solid $stLine',
    borderRadius: '8px',
    boxShadow: '0 8px 20px rgba(9, 9, 11, 0.08)',
  },
  '&[data-drawer]': {
    top: '84px',
    right: 0,
    bottom: '64px',
    width: '112px',
    boxSizing: 'border-box',
    padding: '14px 0 0 14px',
    background: '$readerBg',
    border: 'none',
    borderLeft: '1px solid $stLine',
    borderRadius: 0,
    boxShadow: '-12px 0 28px rgba(9, 9, 11, 0.08)',
    animation: 'stashMapDrawer 220ms cubic-bezier(0.2, 0, 0, 1)',
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  },
  '@keyframes stashMapDrawer': {
    from: { transform: 'translateX(100%)' },
    to: { transform: 'none' },
  },
  '&[data-hidden]': { opacity: 0, pointerEvents: 'none' },
})

// The drawer's "8 min left" over the map.
const DrawerHead = styled('div', {
  marginBottom: '10px',
  fontFamily: '$mono',
  fontSize: '8px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--font-color-muted)',
})

// Beside your finger while you scrub: the section, and how far in.
const Bubble = styled('div', {
  position: 'absolute',
  right: 'calc(100% + 24px)',
  width: '150px',
  transform: 'translateY(-50%)',
  display: 'grid',
  gap: '3px',
  padding: '9px 12px',
  borderRadius: '10px',
  // Ink on paper, flipped: dark on a light page, light on a dark one.
  background: 'var(--font-color)',
  color: '$readerBg',
  boxShadow: '0 10px 24px rgba(9, 9, 11, 0.2)',
  pointerEvents: 'none',
  span: {
    fontFamily: '$mono',
    fontSize: '9px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '$stAccent',
  },
  b: {
    fontFamily: '$inter',
    fontSize: '13px',
    fontWeight: 500,
    lineHeight: 1.25,
  },
})

// The section you're in, over the map: "03 of 08" and its full name.
const Head = styled('div', {
  display: 'grid',
  justifyItems: 'end',
  gap: '3px',
  width: '150px',
  marginLeft: `${WIDTH - 150}px`,
  marginBottom: '14px',
  textAlign: 'right',
  pointerEvents: 'none',
})

const HeadCount = styled('div', {
  fontFamily: '$mono',
  fontSize: '9px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--font-color-muted)',
})

const HeadTitle = styled('div', {
  fontFamily: 'var(--text-font-family)',
  fontStyle: 'italic',
  fontSize: '13px',
  lineHeight: 1.25,
  color: 'var(--font-color)',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const Track = styled('div', {
  position: 'relative',
  cursor: 'pointer',
  touchAction: 'none',
  '[data-drawer] &': { width: '40px' },
})

const Lines = styled('svg', {
  position: 'absolute',
  inset: 0,
  overflow: 'visible',
  display: 'block',
})

const Read = styled('div', {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  overflow: 'hidden',
})

const Label = styled('div', {
  position: 'absolute',
  left: 0,
  right: '-18px',
  paddingRight: '2px',
  fontFamily: '$mono',
  fontSize: '7.5px',
  lineHeight: '9px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: 'var(--font-color-muted)',
  background: '$readerBg',
  pointerEvents: 'none',
  '&[data-read]': { color: 'var(--font-color)' },
  '&[data-current]': { color: '$stAccent', fontWeight: 600 },
  '[data-drawer] &': { right: '-54px' },
})

const Bracket = styled('div', {
  position: 'absolute',
  left: '-6px',
  right: '-6px',
  border: '1px solid var(--font-color)',
  borderRadius: '3px',
  background: 'color-mix(in srgb, var(--font-color) 4%, transparent)',
  pointerEvents: 'none',
  '&[data-scrub]': {
    borderColor: '$stAccent',
    background: 'color-mix(in srgb, var(--colors-stAccent) 6%, transparent)',
  },
})

const Place = styled('div', {
  position: 'absolute',
  left: '-16px',
  lineHeight: 0,
  pointerEvents: 'none',
})

// Lines up under the map's right edge, like the running head over it.
const Foot = styled('div', {
  width: '180px',
  marginLeft: `${WIDTH - 180}px`,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  marginTop: '12px',
  // The rule stays the map's width.
  '&::before': {
    content: '""',
    display: 'block',
    width: `${WIDTH}px`,
    marginLeft: 'auto',
    marginBottom: '10px',
    borderTop: '1px solid $stLine',
  },
  fontFamily: '$mono',
  fontSize: '9px',
  lineHeight: 1.6,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--font-color-muted)',
  '& b': { fontWeight: 500, color: 'var(--font-color)' },
})

const Preview = styled('div', {
  position: 'absolute',
  right: 'calc(100% + 18px)',
  width: '230px',
  display: 'grid',
  gap: '4px',
  padding: '10px 12px',
  background: '$stSurface',
  border: '1px solid $stLineStrong',
  borderRadius: '6px',
  boxShadow: '0 10px 24px rgba(9, 9, 11, 0.1)',
  pointerEvents: 'none',
  transform: 'translateY(-50%)',
})

const PreviewMeta = styled('div', {
  fontFamily: '$mono',
  fontSize: '9px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '$stMuted',
})

const PreviewTitle = styled('div', {
  fontFamily: 'var(--text-font-family)',
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: 1.25,
  color: '$stInk',
})

const PreviewText = styled('div', {
  fontFamily: 'var(--text-font-family)',
  fontSize: '12.5px',
  lineHeight: 1.4,
  color: '$stInk2',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

// A highlight read from the margin: the quote, then your note.
const PreviewQuote = styled('div', {
  fontFamily: 'var(--text-font-family)',
  fontSize: '13px',
  lineHeight: 1.45,
  color: '$stInk',
  display: '-webkit-box',
  WebkitLineClamp: 5,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const PreviewNote = styled('div', {
  paddingLeft: '8px',
  borderLeft: '2px solid $stAccent',
  fontSize: '12px',
  lineHeight: 1.4,
  color: '$stInk2',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const PreviewPicture = styled('img', {
  display: 'block',
  width: '100%',
  maxHeight: '150px',
  objectFit: 'cover',
  borderRadius: '3px',
  background: '$stCanvas',
})

// "4 highlights" in the foot: a click starts at the first.
const FootButton = styled('button', {
  all: 'unset',
  display: 'inline-block',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  verticalAlign: 'top',
  cursor: 'pointer',
  '&:hover, &:focus-visible': { color: '$stAccent' },
  '&:focus-visible': { outline: '1px solid $stAccent' },
})

// The contents the map unfolds into, to its left.
const Panel = styled('div', {
  position: 'absolute',
  top: 0,
  right: 'calc(100% + 18px)',
  width: '300px',
  maxHeight: 'calc(100vh - 120px)',
  display: 'flex',
  flexDirection: 'column',
  background: '$stSurface',
  border: '1px solid $stLineStrong',
  borderRadius: '8px',
  boxShadow: '0 16px 36px rgba(9, 9, 11, 0.12)',
  userSelect: 'none',
  animation: 'stashMapUnfold 160ms cubic-bezier(0.2, 0, 0, 1)',
  '@keyframes stashMapUnfold': {
    from: { opacity: 0, transform: 'translateX(6px)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
})

const Scrim = styled('div', {
  position: 'fixed',
  inset: 0,
  zIndex: 20,
  background: 'rgba(9, 9, 11, 0.2)',
  '@media print': { display: 'none' },
})

// On a phone, the same contents as a sheet from the bottom.
const Sheet = styled('div', {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 21,
  maxHeight: '72vh',
  display: 'flex',
  flexDirection: 'column',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  background: '$stSurface',
  borderTop: '1px solid $stLineStrong',
  borderRadius: '18px 18px 0 0',
  boxShadow: '0 -12px 32px rgba(9, 9, 11, 0.12)',
  fontFamily: '$inter',
  animation: 'stashSheetRise 220ms cubic-bezier(0.2, 0, 0, 1)',
  '@keyframes stashSheetRise': {
    from: { transform: 'translateY(24px)', opacity: 0 },
    to: { transform: 'none', opacity: 1 },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  '@media print': { display: 'none' },
})

const Grabber = styled('div', {
  alignSelf: 'center',
  width: '36px',
  height: '4px',
  margin: '8px 0 6px',
  borderRadius: '2px',
  background: '$stLineStrong',
})

const ContentsTop = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '12px 16px 10px',
  borderBottom: '1px solid $stLine',
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '$stMuted',
})

const Rows = styled('div', {
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: '4px 0',
})

const Row = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  width: '100%',
  display: 'grid',
  gridTemplateColumns: '24px minmax(0, 1fr) auto',
  columnGap: '8px',
  rowGap: '5px',
  padding: '8px 16px',
  cursor: 'pointer',
  fontFamily: '$inter',
  color: '$stInk2',
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-2px' },
  '@media (hover: hover)': { '&:hover': { background: '$stCanvas' } },
  '&[data-hover]': { background: '$stCanvas' },
  '&[data-read]': { color: '$stInk' },
  '&[data-current]': {
    color: '$stInk',
    background: 'color-mix(in srgb, $colors$stAccent 7%, transparent)',
  },
  '@smDown': { minHeight: '48px', padding: '9px 20px' },
})

const RowNumber = styled('span', {
  paddingTop: '2px',
  fontFamily: '$mono',
  fontSize: '10px',
  color: '$stMuted',
  '[data-read] > &': { color: '$stInk' },
  '[data-current] > &': { color: '$stAccent', fontWeight: 600 },
})

const RowTitle = styled('span', {
  fontSize: '13.5px',
  lineHeight: 1.3,
  '[data-current] > &': { fontWeight: 600 },
  '@smDown': { fontSize: '14.5px' },
})

const RowMinutes = styled('span', {
  paddingTop: '2px',
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.04em',
  color: '$stMuted',
  textAlign: 'right',
  whiteSpace: 'nowrap',
})

const RowLine = styled('span', {
  gridColumn: '2',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
})

const RowRead = styled('span', {
  position: 'relative',
  flex: 1,
  height: '2px',
  borderRadius: '1px',
  overflow: 'hidden',
  background: '$stLine',
  span: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    background: '$stInk',
  },
  '[data-current] &': { span: { background: '$stAccent' } },
})

const Dot = styled('span', {
  width: '5px',
  height: '5px',
  borderRadius: '50%',
  background: '$stAccent',
  flexShrink: 0,
})

const RowPreview = styled('span', {
  gridColumn: '2 / 4',
  fontFamily: 'var(--text-font-family)',
  fontSize: '12.5px',
  lineHeight: 1.4,
  color: '$stMuted',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const ContentsFoot = styled('div', {
  padding: '11px 16px',
  borderTop: '1px solid $stLine',
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '$stInk',
  fontWeight: 500,
})

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

const countWords = (text: string) => (text ? text.split(' ').length : 0)

const measure = (root: HTMLElement): Shape => {
  const origin = root.getBoundingClientRect().top
  const column = root.getBoundingClientRect().width
  const blocks: Block[] = []
  root.querySelectorAll<HTMLElement>(BLOCKS).forEach((element) => {
    const outer = element.parentElement?.closest(BLOCKS)
    if (outer && root.contains(outer)) return
    const rect = element.getBoundingClientRect()
    if (rect.height < 2 || getComputedStyle(element).display == 'none') return
    const tag = element.tagName
    const text = clean(element.textContent ?? '')
    const image =
      tag == 'IMG'
        ? (element as HTMLImageElement)
        : element.querySelector<HTMLImageElement>('img')
    const kind: Block['kind'] = /^H[1-4]$/.test(tag)
      ? 'heading'
      : tag == 'BLOCKQUOTE'
      ? 'quote'
      : tag == 'IFRAME' ||
        tag == 'VIDEO' ||
        (tag == 'FIGURE' && !image && element.querySelector('iframe, video'))
      ? 'embed'
      : tag == 'FIGURE' || tag == 'IMG' || (!text && image)
      ? 'picture'
      : 'text'
    if ((kind == 'text' || kind == 'heading') && !text) return
    const shown =
      kind == 'picture' && image ? image.getBoundingClientRect() : rect
    blocks.push({
      kind,
      top: (kind == 'picture' ? shown.top : rect.top) - origin,
      height: kind == 'picture' ? Math.max(2, shown.height) : rect.height,
      src:
        kind == 'picture' && image
          ? image.currentSrc || image.src || undefined
          : undefined,
      width:
        kind == 'picture'
          ? Math.min(1, Math.max(0.2, shown.width / Math.max(1, column)))
          : undefined,
      caption:
        kind == 'picture'
          ? clean(
              element.querySelector('figcaption')?.textContent ||
                image?.alt ||
                ''
            ).slice(0, 160) || undefined
          : undefined,
      label: kind == 'heading' ? text : undefined,
      preview: text.slice(0, 220),
      words: kind == 'heading' ? 0 : countWords(text),
    })
  })
  // A highlight can span several elements; its text is all of them.
  const found = new Map<string, Highlight>()
  root
    .querySelectorAll<HTMLElement>('[omnivore-highlight-id]')
    .forEach((element) => {
      const id = element.getAttribute('omnivore-highlight-id') ?? ''
      const text = element.textContent ?? ''
      const known = found.get(id)
      if (known) {
        known.quote += text
        known.hasNote ||= element.classList.contains('highlight_with_note')
        return
      }
      found.set(id, {
        id,
        top: element.getBoundingClientRect().top - origin,
        quote: text,
        hasNote: element.classList.contains('highlight_with_note'),
      })
    })
  const highlights = Array.from(found.values())
    .map((highlight) => ({ ...highlight, quote: clean(highlight.quote) }))
    .sort((a, b) => a.top - b.top)
  return { blocks, highlights, height: root.scrollHeight }
}

// The article's sections, one per heading, plus the opening before the
// first. None unless there are at least two headings.
const findSections = (shape: Shape): Section[] => {
  const sections: Section[] = []
  let number = 0
  shape.blocks.forEach((block) => {
    if (block.kind == 'heading') {
      number += 1
      sections.push({
        number,
        label: block.label ?? '',
        short: '',
        top: block.top,
        end: shape.height,
        words: 0,
        highlights: 0,
        preview: '',
      })
      return
    }
    if (!sections.length) {
      sections.push({
        number: 0,
        label: 'Opening',
        short: 'Opening',
        top: 0,
        end: shape.height,
        words: 0,
        highlights: 0,
        preview: '',
      })
    }
    const section = sections[sections.length - 1]
    section.words += block.words
    if (!section.preview && block.kind != 'picture' && block.kind != 'embed') {
      section.preview = block.preview
    }
  })
  if (number < 2) return []
  sections.forEach((section, index) => {
    section.end = sections[index + 1]?.top ?? shape.height
  })
  shape.highlights.forEach(({ top }) => {
    const section = sections.filter((s) => s.top <= top + 1).pop()
    if (section) section.highlights += 1
  })
  const headed = sections.filter((section) => section.number > 0)
  const shorts = shortNames(headed.map((section) => section.label))
  headed.forEach((section, index) => {
    section.short = shorts[index]
  })
  return sections
}

// "0-120,300-410" to and from a mark per thousandth.
const parseTrail = (text: string | null | undefined, into: Uint8Array) => {
  ;(text ?? '').split(',').forEach((part) => {
    const match = /^(\d+)-(\d+)$/.exec(part.trim())
    if (!match) return
    const end = Math.min(STEPS, Number(match[2]))
    for (let i = Math.max(0, Number(match[1])); i <= end; i++) into[i] = 1
  })
}

const trailRanges = (text: string): [number, number][] =>
  text
    ? text.split(',').map((part) => {
        const [start, end] = part.split('-').map(Number)
        return [start, end]
      })
    : []

const formatTrail = (read: Uint8Array): string => {
  const out: string[] = []
  let start = -1
  for (let i = 0; i <= STEPS + 1; i++) {
    if (i <= STEPS && read[i]) {
      if (start < 0) start = i
    } else if (start >= 0) {
      out.push(`${start}-${i - 1}`)
      start = -1
    }
  }
  return out.join(',')
}

// A paragraph's last line is a little short, the way text really ends.
const lastLine = (index: number) => 40 + ((index * 37) % 50)

const finishTime = (minutes: number) =>
  new Date(Date.now() + minutes * 60000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

type MarginMapProps = {
  contentRef: MutableRefObject<HTMLDivElement | null>
  contentKey: string
  wordsCount?: number
  // Where you were when the article opened, as a percentage.
  resumeProgress?: number
  // Your notes on highlights, by highlight id.
  notes?: Record<string, string>
  // The article, and where its reading trail is loaded from and saved to.
  itemId?: string
  loadTrail?: (id: string) => Promise<string | undefined>
  saveTrail?: (input: { id: string; trail: string }) => Promise<boolean>
}

export function MarginMap(props: MarginMapProps): JSX.Element | null {
  const [shape, setShape] = useState<Shape | undefined>()
  const [mode, setMode] = useState<'wide' | 'phone' | 'none'>('none')
  const [scroll, setScroll] = useState({ y: 0, view: 800, top: 0 })
  const [awake, setAwake] = useState(false)
  const [hover, setHover] = useState<number | undefined>()
  // The contents: unfolded beside the map, or as a sheet on a phone.
  const [unfolded, setUnfolded] = useState(false)
  const [sheet, setSheet] = useState(false)
  // On a phone: the drawer, and whether a finger is scrubbing it.
  const [drawer, setDrawer] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const scrub = useRef<{ y: number; scroll: number } | undefined>()
  const linger = useRef(0)
  const ticked = useRef<number | undefined>()
  // The reading trail: what's counted as read, and how close each part is.
  const trail = useRef(new Uint8Array(STEPS + 1))
  const credit = useRef(new Float32Array(STEPS + 1))
  const [trailText, setTrailText] = useState('')
  const shapeRef = useRef<Shape | undefined>()
  shapeRef.current = shape
  const saving = useRef({ timer: 0, pending: '' })
  const saveTrailRef = useRef(props.saveTrail)
  saveTrailRef.current = props.saveTrail
  const loadTrailRef = useRef(props.loadTrail)
  loadTrailRef.current = props.loadTrail
  const queueSave = useRef<(text: string) => void>(() => undefined)
  const [resume] = useState(() => props.resumeProgress ?? 0)
  const dragging = useRef(false)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const unfoldTimer = useRef(0)

  // Measure the article, and again whenever it changes size.
  useEffect(() => {
    const root = props.contentRef.current
    if (!root) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setShape(measure(root))
        const width = window.innerWidth
        setMode(marginMapShown() ? 'wide' : width < PHONE ? 'phone' : 'none')
      })
    }
    const timer = setTimeout(update, 300)
    const observer = new ResizeObserver(update)
    observer.observe(root)
    window.addEventListener('resize', update)
    // Highlights added or removed change the ticks.
    const mutations = new MutationObserver(update)
    mutations.observe(root, { subtree: true, childList: true })
    const notebook = new MutationObserver(update)
    notebook.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-notebook'],
    })
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      observer.disconnect()
      mutations.disconnect()
      notebook.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [props.contentRef, props.contentKey])

  // Follow the scroll; on a phone, wake up only for a quick scroll.
  const measured = !!shape
  useEffect(() => {
    if (!measured) return
    let last = { y: window.scrollY, at: performance.now() }
    let sleep = 0
    const onScroll = () => {
      const root = props.contentRef.current
      if (!root) return
      setScroll({
        y: window.scrollY,
        view: window.innerHeight,
        top: root.getBoundingClientRect().top + window.scrollY,
      })
      if (mode == 'phone') {
        const now = performance.now()
        const speed = Math.abs(window.scrollY - last.y) / (now - last.at || 1)
        last = { y: window.scrollY, at: now }
        if (speed > 1.6 || dragging.current) {
          setAwake(true)
          clearTimeout(sleep)
          sleep = window.setTimeout(() => {
            if (!dragging.current) setAwake(false)
          }, 1200)
        }
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(sleep)
      window.removeEventListener('scroll', onScroll)
    }
  }, [mode, props.contentRef, measured])

  const sections = useMemo(() => (shape ? findSections(shape) : []), [shape])

  // Load the trail: what this device remembers and what the server has.
  // An article read before the trail existed counts as read up to where
  // you'd got.
  const itemId = props.itemId
  useEffect(() => {
    trail.current = new Uint8Array(STEPS + 1)
    credit.current = new Float32Array(STEPS + 1)
    setTrailText('')
    if (!itemId) return
    let live = true
    let local = ''
    try {
      local = localStorage.getItem(`stash:trail:${itemId}`) ?? ''
    } catch {
      local = ''
    }
    const add = (text: string) => {
      parseTrail(text, trail.current)
      setTrailText(formatTrail(trail.current))
    }
    add(local)
    Promise.resolve()
      .then(() => loadTrailRef.current?.(itemId))
      .catch(() => undefined)
      .then((server) => {
        if (!live) return
        if (server) add(server)
        else if (!local && resume >= 3) {
          add(`0-${Math.min(STEPS, Math.round(resume * 10))}`)
        }
        // Anything the server hasn't got yet (read offline, or while it
        // was down) goes up with the next save.
        const text = formatTrail(trail.current)
        if (text && text != (server ?? '')) queueSave.current(text)
      })
    return () => {
      live = false
    }
  }, [itemId, resume])

  // Save it: on this device straight away, to the server a little later
  // (and when you leave).
  useEffect(() => {
    if (!itemId) return
    saving.current.pending = ''
    // The server merges what it's sent, so the whole trail can go each
    // time. It stays pending until a save succeeds.
    const flush = () => {
      window.clearTimeout(saving.current.timer)
      const text = saving.current.pending
      const save = saveTrailRef.current
      if (!text || !save) return
      Promise.resolve()
        .then(() => save({ id: itemId, trail: text }))
        .then((ok) => {
          if (ok !== false && saving.current.pending == text) {
            saving.current.pending = ''
          }
        })
        .catch(() => undefined)
    }
    queueSave.current = (text: string) => {
      saving.current.pending = text
      window.clearTimeout(saving.current.timer)
      saving.current.timer = window.setTimeout(flush, 5000)
    }
    const onHide = () => {
      if (document.visibilityState == 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [itemId])

  // Each second, credit what's on screen with the time it's been up there.
  // A part counts as read once it's had enough of the time its words take
  // to read. Flicks, jumps and scrubbing count for nothing.
  useEffect(() => {
    if (!measured || !itemId) return
    let lastY = window.scrollY
    const timer = window.setInterval(() => {
      const root = props.contentRef.current
      const shape = shapeRef.current
      const y = window.scrollY
      const moved = Math.abs(y - lastY)
      lastY = y
      if (!root || !shape || document.visibilityState != 'visible') return
      if (moved > window.innerHeight * 0.8 || dragging.current) return
      const top = root.getBoundingClientRect().top + y
      const from = Math.max(0, (y - top + 84) / shape.height)
      const to = Math.min(1, (y - top + window.innerHeight) / shape.height)
      if (to <= from) return
      const words = shape.blocks.reduce((sum, block) => sum + block.words, 0)
      const onScreen = Math.max(20, (to - from) * words)
      const gain = Math.min(0.5, WORDS_A_SECOND / onScreen)
      const read = trail.current
      const got = credit.current
      let changed = false
      const end = Math.min(STEPS, Math.ceil(to * STEPS))
      for (let i = Math.floor(from * STEPS); i <= end; i++) {
        got[i] += gain
        if (!read[i] && got[i] >= ENOUGH) {
          read[i] = 1
          changed = true
        }
      }
      if (!changed) return
      const text = formatTrail(read)
      setTrailText(text)
      try {
        localStorage.setItem(`stash:trail:${itemId}`, text)
      } catch {
        // Private windows: the server still keeps it.
      }
      queueSave.current(text)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [measured, itemId, props.contentRef])

  // Asked for the contents from elsewhere (the top bar, or the app).
  useEffect(() => {
    if (!sections.length) return
    const open = () => {
      if (mode == 'wide') setUnfolded(true)
      else setSheet(true)
    }
    window.addEventListener(CONTENTS_EVENT, open)
    return () => window.removeEventListener(CONTENTS_EVENT, open)
  }, [sections.length, mode])

  useEffect(() => {
    if (!sheet && !unfolded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key != 'Escape') return
      setSheet(false)
      setUnfolded(false)
    }
    // Opened from the top bar, the contents close on a click elsewhere.
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-margin-map]')) setUnfolded(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [sheet, unfolded])

  useEffect(
    () => () => {
      window.clearTimeout(unfoldTimer.current)
      window.clearTimeout(linger.current)
    },
    []
  )

  const showsMap =
    !!shape && mode != 'none' && shape.height >= 2.5 * scroll.view

  const height = useMemo(() => {
    if (!shape) return 0
    const room =
      window.innerHeight -
      (mode == 'phone' ? 220 : 230) -
      (mode == 'wide' && sections.length ? 50 : 0)
    return Math.max(80, Math.min(room, shape.height * 0.2))
  }, [shape, mode, sections.length])
  const scale = shape ? height / Math.max(1, shape.height) : 0

  // Let go of a scrub: land, and the drawer slides away a moment later.
  const release = useCallback(() => {
    scrub.current = undefined
    dragging.current = false
    setScrubbing(false)
    window.clearTimeout(linger.current)
    linger.current = window.setTimeout(() => setDrawer(false), LINGER)
  }, [])

  // On a phone: hold near the right edge for the drawer, then drag to
  // scrub. The page moves with your finger at the map's scale, so it
  // doesn't jump when the scrub starts.
  useEffect(() => {
    if (mode != 'phone' || !showsMap || !scale) return
    let hold = 0
    let start: { x: number; y: number } | undefined
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (event.touches.length != 1 || !touch) return
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-margin-map]')) return
      if (touch.clientX < window.innerWidth - EDGE) return
      const at = { x: touch.clientX, y: touch.clientY }
      start = at
      window.clearTimeout(hold)
      hold = window.setTimeout(() => {
        window.clearTimeout(linger.current)
        scrub.current = { y: at.y, scroll: window.scrollY }
        dragging.current = true
        setDrawer(true)
        setScrubbing(true)
        tick()
      }, HOLD)
    }
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) return
      if (scrub.current) {
        event.preventDefault()
        window.scrollTo({
          top: scrub.current.scroll + (touch.clientY - scrub.current.y) / scale,
        })
        return
      }
      if (
        start &&
        Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10
      ) {
        window.clearTimeout(hold)
        start = undefined
      }
    }
    const onEnd = () => {
      window.clearTimeout(hold)
      start = undefined
      if (scrub.current) release()
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      window.clearTimeout(hold)
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [mode, showsMap, scale, release])

  // Where you're reading, in the article's own coordinates.
  const eye = scroll.y - scroll.top + scroll.view * EYE
  const readEnd = scroll.y + scroll.view - scroll.top
  const current = sections.filter((section) => section.top <= eye).pop()

  // Tell the top bar (and the app) about the sections and where you are.
  const marksKey = useMemo(() => {
    if (!sections.length || typeof document == 'undefined') return ''
    const max = document.documentElement.scrollHeight - scroll.view
    if (max <= 0) return ''
    return sections
      .filter((section) => section.number > 0)
      .map((section) =>
        Math.min(
          1,
          Math.max(0, (scroll.top + section.top - scroll.view * EYE) / max)
        ).toFixed(4)
      )
      .join(',')
  }, [sections, scroll.top, scroll.view, shape?.height])
  const headed = sections.filter((section) => section.number > 0).length
  const currentNumber = current?.number
  const currentLabel = current?.label
  useEffect(() => {
    const detail: SectionsDetail = {
      count: headed,
      current:
        currentNumber && currentLabel
          ? { number: currentNumber, label: currentLabel }
          : undefined,
      marks: marksKey ? marksKey.split(',').map(Number) : [],
    }
    window.dispatchEvent(new CustomEvent(SECTIONS_EVENT, { detail }))
  }, [headed, currentNumber, currentLabel, marksKey])
  // A tick each time a scrub crosses into another section.
  useEffect(() => {
    if (!scrubbing) {
      ticked.current = undefined
      return
    }
    if (ticked.current !== undefined && ticked.current !== currentNumber) {
      tick()
    }
    ticked.current = currentNumber
  }, [scrubbing, currentNumber])
  useEffect(
    () => () => {
      const detail: SectionsDetail = { count: 0, marks: [] }
      window.dispatchEvent(new CustomEvent(SECTIONS_EVENT, { detail }))
    },
    []
  )

  const lines = useMemo(() => {
    if (!shape) return []
    const out: { y: number; w: number; x: number; heading?: boolean }[] = []
    shape.blocks.forEach((block, index) => {
      if (block.kind == 'picture' || block.kind == 'embed') return
      const y = block.top * scale
      const h = block.height * scale
      if (block.kind == 'heading') {
        out.push({ y, w: 30, x: 0, heading: true })
        return
      }
      const count = Math.max(1, Math.floor(h / LINE_GAP))
      for (let line = 0; line < count; line++) {
        out.push({
          y: y + line * LINE_GAP,
          x: block.kind == 'quote' ? 5 : 0,
          w: line == count - 1 && count > 1 ? lastLine(index) : 100,
        })
      }
    })
    return out
  }, [shape, scale])

  const labels = useMemo(() => {
    if (!shape || (mode == 'phone' && !drawer)) return []
    let floor = -Infinity
    const headed = sections.filter((section) => section.number > 0)
    const source = headed.length
      ? headed.map((section) => ({
          y: section.top * scale,
          number: section.number,
          text: `${sectionNumber(section.number)} ${section.short}`,
        }))
      : shape.blocks
          .filter((block) => block.kind == 'heading')
          .map((block) => ({
            y: block.top * scale,
            number: 0,
            text: block.label ?? '',
          }))
    return source.filter((label) => {
      if (label.y < floor) return false
      floor = label.y + 12
      return true
    })
  }, [shape, sections, scale, mode, drawer])

  const travel = useCallback(
    (clientY: number, smooth: boolean) => {
      const track = trackRef.current
      if (!track || !scale) return
      const y = (clientY - track.getBoundingClientRect().top) / scale
      window.scrollTo({
        top: scroll.top + y - window.innerHeight * EYE,
        behavior: smooth ? 'smooth' : 'auto',
      })
    },
    [scale, scroll.top]
  )

  // Go to a section: its heading lands just under the top bar.
  const goTo = (section: Section) => {
    const top =
      section.number == 0 ? scroll.top - 120 : scroll.top + section.top
    window.scrollTo({ top: Math.max(0, top - 84), behavior: 'smooth' })
    setSheet(false)
    setUnfolded(false)
  }

  // Go to a highlight: it lands where you read.
  const goToHighlight = useCallback(
    (highlight: Highlight) => {
      const root = props.contentRef.current
      if (!root) return
      const top = root.getBoundingClientRect().top + window.scrollY
      window.scrollTo({
        top: Math.max(0, top + highlight.top - window.innerHeight * EYE),
        behavior: 'smooth',
      })
      setUnfolded(false)
    },
    [props.contentRef]
  )

  // [ and ] step to the previous and next highlight.
  const highlightList = shape?.highlights
  useEffect(() => {
    if (!highlightList?.length) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key != '[' && event.key != ']') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      const root = props.contentRef.current
      if (!root) return
      const eyeNow = window.innerHeight * EYE - root.getBoundingClientRect().top
      const next =
        event.key == ']'
          ? highlightList.find((highlight) => highlight.top > eyeNow + 8)
          : [...highlightList]
              .reverse()
              .find((highlight) => highlight.top < eyeNow - 8)
      if (!next) return
      event.preventDefault()
      goToHighlight(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [highlightList, goToHighlight, props.contentRef])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (dragging.current) travel(event.clientY, false)
    }
    const up = () => {
      if (!dragging.current) return
      dragging.current = false
      if (mode == 'phone') release()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [travel, mode, release])

  if (!shape || (!showsMap && !sheet)) {
    return null
  }

  const total = readingMinutes(props.wordsCount)
  const done = Math.min(1, Math.max(0, readEnd / shape.height))
  const leftMinutes =
    total !== undefined ? Math.round(total * (1 - done)) : undefined
  const left = formatMinutes(leftMinutes)
  const allWords = sections.reduce((sum, section) => sum + section.words, 0)

  // What's been read, in thousandths: the trail, or everything above the
  // screen where there's no trail to keep.
  const readRanges: [number, number][] = itemId
    ? trailRanges(trailText)
    : readEnd > 0
    ? [[0, Math.min(STEPS, Math.round((readEnd / shape.height) * STEPS))]]
    : []
  // How much of a stretch of the article (in its own pixels) has been read.
  const cover = (from: number, to: number) => {
    const a = (from / shape.height) * STEPS
    const b = (to / shape.height) * STEPS
    if (b <= a) return 0
    const got = readRanges.reduce(
      (sum, [start, end]) =>
        sum + Math.max(0, Math.min(b, end + 1) - Math.max(a, start)),
      0
    )
    return Math.min(1, got / (b - a))
  }
  const isRead = (y: number) => cover(y, y + 1) > 0
  // Sections you went past without reading, and other gaps behind you.
  const furthest = readRanges.length
    ? ((readRanges[readRanges.length - 1][1] + 1) / STEPS) * shape.height
    : 0
  const skipped = sections.filter(
    (section) =>
      section.end <= furthest + 1 &&
      section.words >= 30 &&
      cover(section.top, section.end) < 0.5
  )
  const gap = !sections.length
    ? readRanges
        .slice(1)
        .map((range, index) => [readRanges[index][1] + 1, range[0]])
        .find(([start, end]) => end - start >= 50)
    : undefined
  // Each section's share of the reading time, rounded so they add up.
  const shares = sections.map((section) =>
    total && allWords ? (total * section.words) / allWords : 0
  )
  const whole = shares.map(Math.floor)
  let spare = (total ?? 0) - whole.reduce((sum, n) => sum + n, 0)
  shares
    .map((share, index) => ({ index, rest: share - Math.floor(share) }))
    .sort((a, b) => b.rest - a.rest)
    .forEach(({ index }) => {
      if (spare-- > 0) whole[index] += 1
    })
  const sectionMinutes = (section: Section) => {
    const minutes = whole[sections.indexOf(section)]
    if (!section.words || minutes === undefined) return ''
    return minutes < 1 ? '<1 min' : `${minutes} min`
  }

  // What's under the pointer, as a place in the article.
  const hoverY = hover !== undefined && scale ? hover / scale : undefined
  const hovered =
    hoverY !== undefined
      ? sections.filter((section) => section.top <= hoverY).pop()
      : undefined

  const contents = (phone: boolean) => (
    <>
      <ContentsTop>
        <span>Contents · {headed} sections</span>
        <span>{total !== undefined ? `${total} min` : ''}</span>
      </ContentsTop>
      <Rows>
        {sections.map((section) => {
          const span = Math.max(1, section.end - section.top)
          const read = cover(section.top, section.top + span)
          const isCurrent = section === current
          const isHovered = !phone && section === hovered
          return (
            <Row
              key={`${section.number}-${section.top}`}
              type="button"
              data-current={isCurrent ? '' : undefined}
              data-read={read >= 0.98 ? '' : undefined}
              data-hover={isHovered && !isCurrent ? '' : undefined}
              onClick={() => goTo(section)}
            >
              <RowNumber>{sectionNumber(section.number)}</RowNumber>
              <RowTitle>{section.label}</RowTitle>
              <RowMinutes>{sectionMinutes(section)}</RowMinutes>
              <RowLine aria-hidden="true">
                <RowRead>
                  <span style={{ width: `${Math.round(read * 100)}%` }} />
                </RowRead>
                {Array.from({ length: Math.min(5, section.highlights) }).map(
                  (_, index) => (
                    <Dot key={index} />
                  )
                )}
              </RowLine>
              {isHovered && section.preview && (
                <RowPreview>{section.preview}</RowPreview>
              )}
            </Row>
          )
        })}
      </Rows>
      {leftMinutes !== undefined && (
        <ContentsFoot>
          {done >= 0.99
            ? 'Done'
            : `${left} left · done around ${finishTime(leftMinutes)}`}
        </ContentsFoot>
      )}
    </>
  )

  const sheetView = sheet && sections.length > 0 && (
    <>
      <Scrim onClick={() => setSheet(false)} />
      <Sheet role="dialog" aria-label="Contents">
        <Grabber aria-hidden="true" />
        {contents(true)}
      </Sheet>
    </>
  )

  if (!showsMap) {
    return sheetView || null
  }

  const bracketTop = Math.max(0, (scroll.y - scroll.top + 84) * scale)
  const bracketHeight = Math.max(8, (scroll.view - 84) * scale)

  // Without sections, the pointer previews its section and opening words.
  // A highlight tick or a picture under the pointer reads out beside it.
  const tickAt = (y: number) =>
    shape.highlights
      .map((highlight) => ({
        highlight,
        off: Math.abs(highlight.top * scale - y),
      }))
      .filter(({ off }) => off <= 4)
      .sort((a, b) => a.off - b.off)[0]?.highlight
  const hoverTick =
    hover !== undefined && mode == 'wide' ? tickAt(hover) : undefined
  const hoverPicture =
    hover !== undefined && mode == 'wide' && !hoverTick
      ? shape.blocks.find(
          (block) =>
            block.kind == 'picture' &&
            block.src &&
            hover >= block.top * scale - 1 &&
            hover <= (block.top + block.height) * scale + 1
        )
      : undefined
  const minutesAt = (y: number) => {
    const minutes =
      total !== undefined ? Math.round((total * y) / shape.height) : undefined
    return minutes ? `${minutes} min in` : 'The start'
  }

  let preview: { section: string; text: string; at: string } | undefined
  if (
    hoverY !== undefined &&
    mode == 'wide' &&
    !sections.length &&
    !hoverTick &&
    !hoverPicture
  ) {
    const y = hoverY
    const block =
      shape.blocks.find((b) => b.top <= y && y <= b.top + b.height + 16) ??
      shape.blocks.find((b) => b.top >= y)
    const heading = shape.blocks
      .filter((b) => b.kind == 'heading' && b.top <= y)
      .pop()
    if (block) {
      const minutesIn =
        total !== undefined ? Math.round((total * y) / shape.height) : undefined
      preview = {
        section: heading?.label ?? 'Opening',
        text: block.kind == 'heading' ? '' : block.preview,
        at:
          minutesIn !== undefined && minutesIn > 0
            ? `${minutesIn} min in`
            : 'The start',
      }
    }
  }

  // The map, drawn twice: faint for what's ahead, darker (and pictures in
  // colour) for what you've read.
  const draw = (color: string, headingColor: string, read: boolean) => (
    <Lines width="100%" height={height} aria-hidden="true">
      {lines.map((line, index) => (
        <rect
          key={index}
          x={`${line.x}`}
          y={line.y}
          width={`${line.w - line.x}%`}
          height={line.heading ? 2 : 1}
          fill={line.heading ? headingColor : color}
        />
      ))}
      {shape.blocks.map((block, index) => {
        if (block.kind != 'picture' && block.kind != 'embed') return null
        const y = block.top * scale
        const h = Math.max(2, block.height * scale - 1)
        const w = `${Math.round((block.width ?? 1) * 100)}%`
        if (block.kind == 'picture' && block.src) {
          return (
            <image
              key={`p${index}`}
              href={block.src}
              x="0"
              y={y}
              width={w}
              height={h}
              preserveAspectRatio="xMidYMid slice"
              style={
                read ? undefined : { filter: 'grayscale(1)', opacity: 0.35 }
              }
            />
          )
        }
        return (
          <g key={`p${index}`}>
            <rect
              x="0"
              y={y}
              width={w}
              height={h}
              rx="1"
              fill={color}
              opacity="0.6"
            />
            {block.kind == 'embed' && h >= 8 && (
              // A small play mark for videos and embeds.
              <svg x="44%" y={y + h / 2 - 3} overflow="visible">
                <path d="M 0 0 l 5 3 l -5 3 z" fill={headingColor} />
              </svg>
            )}
          </g>
        )
      })}
      {shape.highlights.map((highlight) =>
        highlight.hasNote ? (
          // With a note: an open tick.
          <rect
            key={highlight.id}
            x="0.5"
            y={highlight.top * scale - 0.5}
            width="98%"
            height="3"
            fill="none"
            stroke="var(--colors-stAccent)"
            strokeWidth="1"
          />
        ) : (
          <rect
            key={highlight.id}
            x="0"
            y={highlight.top * scale}
            width="100%"
            height="2"
            fill="var(--colors-stAccent)"
          />
        )
      )}
    </Lines>
  )

  const readDrawing = draw(
    'color-mix(in srgb, var(--font-color) 42%, transparent)',
    'var(--font-color)',
    true
  )
  const hidden = mode == 'phone' && !awake && !drawer
  const minutesIn =
    total !== undefined ? Math.round((total * eye) / shape.height) : undefined
  const unfolds = mode == 'wide' && sections.length > 0
  // The contents unfold once the pointer has rested on the map a moment.
  const armUnfold = () => {
    if (!unfolds) return
    window.clearTimeout(unfoldTimer.current)
    unfoldTimer.current = window.setTimeout(() => {
      if (!dragging.current) setUnfolded(true)
    }, 300)
  }

  return (
    <>
      <Root
        data-margin-map=""
        data-phone={mode == 'phone' ? '' : undefined}
        data-drawer={mode == 'phone' && drawer ? '' : undefined}
        data-hidden={hidden ? '' : undefined}
        onMouseEnter={armUnfold}
        onMouseLeave={() => {
          window.clearTimeout(unfoldTimer.current)
          unfoldTimer.current = window.setTimeout(() => setUnfolded(false), 200)
        }}
      >
        {unfolds && current && current.number > 0 && (
          <Head
            aria-hidden="true"
            // The contents cover it while open; it keeps its room.
            style={{ visibility: unfolded ? 'hidden' : undefined }}
          >
            <HeadCount>
              {sectionNumber(current.number)} of {sectionNumber(headed)}
            </HeadCount>
            <HeadTitle>{current.label}</HeadTitle>
          </Head>
        )}
        {unfolds && (!current || current.number == 0) && (
          <Head
            aria-hidden="true"
            // The contents cover it while open; it keeps its room.
            style={{ visibility: unfolded ? 'hidden' : undefined }}
          >
            <HeadCount>{headed} sections</HeadCount>
          </Head>
        )}
        {mode == 'phone' && drawer && left && (
          <DrawerHead aria-hidden="true">
            {done >= 0.99 ? 'Done' : `${left} left`}
          </DrawerHead>
        )}
        <Track
          ref={trackRef}
          aria-hidden="true"
          style={{ height: `${height}px` }}
          onPointerDown={(event: ReactMouseEvent<HTMLDivElement>) => {
            const tick =
              mode == 'wide' &&
              tickAt(
                event.clientY - event.currentTarget.getBoundingClientRect().top
              )
            if (tick) {
              goToHighlight(tick)
              return
            }
            dragging.current = true
            if (mode == 'phone') {
              window.clearTimeout(linger.current)
              setDrawer(true)
              setScrubbing(true)
            }
            travel(event.clientY, mode == 'wide')
          }}
          onMouseMove={(event) => {
            const y =
              event.clientY - event.currentTarget.getBoundingClientRect().top
            setHover(y)
            // Reading a highlight or a picture holds the contents back.
            const over =
              tickAt(y) ||
              shape.blocks.some(
                (block) =>
                  block.kind == 'picture' &&
                  block.src &&
                  y >= block.top * scale - 1 &&
                  y <= (block.top + block.height) * scale + 1
              )
            if (over) {
              window.clearTimeout(unfoldTimer.current)
              if (unfolded) setUnfolded(false)
            } else if (!unfolded) {
              armUnfold()
            }
          }}
          onMouseLeave={() => setHover(undefined)}
        >
          {draw(
            'color-mix(in srgb, var(--font-color) 16%, transparent)',
            'color-mix(in srgb, var(--font-color) 40%, transparent)',
            false
          )}
          {readRanges.map(([start, end]) => {
            const top = (start / STEPS) * height
            const bottom = ((end + 1) / STEPS) * height
            return (
              <Read
                key={start}
                style={{ top: `${top}px`, height: `${bottom - top}px` }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: `${-top}px`,
                    height: `${height}px`,
                  }}
                >
                  {readDrawing}
                </div>
              </Read>
            )
          })}
          <Bracket
            data-scrub={mode == 'phone' && scrubbing ? '' : undefined}
            style={{
              top: `${bracketTop - 3}px`,
              height: `${bracketHeight + 6}px`,
            }}
          />
          {labels.map((label, index) => (
            <Label
              key={index}
              style={{ top: `${label.y + 3}px` }}
              data-current={
                label.number && label.number === current?.number
                  ? ''
                  : undefined
              }
              data-read={
                isRead(label.y / scale) || !sections.length ? '' : undefined
              }
            >
              {label.text}
            </Label>
          ))}
          {resume >= 3 && resume <= 97 && mode == 'wide' && (
            <Place style={{ top: `${(resume / 100) * height - 4}px` }}>
              <Ribbon width={7} height={16} />
            </Place>
          )}
          {mode == 'phone' && scrubbing && (
            <Bubble
              aria-hidden="true"
              style={{ top: `${Math.min(height, Math.max(0, eye * scale))}px` }}
            >
              <span>
                {[
                  current && current.number > 0
                    ? sectionNumber(current.number)
                    : undefined,
                  minutesIn ? `${minutesIn} min in` : 'The start',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {current && (
                <b>{current.number > 0 ? current.label : 'Opening'}</b>
              )}
            </Bubble>
          )}
          {hoverTick && (
            <Preview style={{ top: `${hoverTick.top * scale}px` }}>
              <PreviewMeta>
                Highlight {shape.highlights.indexOf(hoverTick) + 1} of{' '}
                {shape.highlights.length} · {minutesAt(hoverTick.top)}
              </PreviewMeta>
              <PreviewQuote>{hoverTick.quote}</PreviewQuote>
              {props.notes?.[hoverTick.id] && (
                <PreviewNote>{props.notes[hoverTick.id]}</PreviewNote>
              )}
            </Preview>
          )}
          {hoverPicture && (
            <Preview
              style={{
                top: `${
                  (hoverPicture.top + hoverPicture.height / 2) * scale
                }px`,
              }}
            >
              <PreviewPicture src={hoverPicture.src} alt="" />
              <PreviewMeta>{minutesAt(hoverPicture.top)}</PreviewMeta>
              {hoverPicture.caption && (
                <PreviewText>{hoverPicture.caption}</PreviewText>
              )}
            </Preview>
          )}
          {preview && hover !== undefined && (
            <Preview style={{ top: `${hover}px` }}>
              <PreviewMeta>{preview.at}</PreviewMeta>
              <PreviewTitle>{preview.section}</PreviewTitle>
              {preview.text && <PreviewText>{preview.text}</PreviewText>}
            </Preview>
          )}
        </Track>
        {mode == 'wide' && (
          <Foot>
            {left && (
              <>
                <b>{done >= 0.99 ? 'Done' : `${left} left`}</b>
                <br />
              </>
            )}
            {shape.highlights.length > 0 && (
              <FootButton
                type="button"
                title="Go to the first highlight ( [ and ] step )"
                onClick={() => goToHighlight(shape.highlights[0])}
              >
                {shape.highlights.length} highlight
                {shape.highlights.length == 1 ? '' : 's'}
              </FootButton>
            )}
            {skipped.length > 0 && (
              <>
                {shape.highlights.length > 0 && <br />}
                <FootButton
                  type="button"
                  title={`Go back to ${skipped[0].label}`}
                  onClick={() => goTo(skipped[0])}
                >
                  Skipped{' '}
                  {skipped.length == 1
                    ? `${sectionNumber(skipped[0].number)} ${skipped[0].short}`
                    : `${skipped.length} sections`}
                </FootButton>
              </>
            )}
            {gap && (
              <>
                {shape.highlights.length > 0 && <br />}
                <FootButton
                  type="button"
                  title="Go back to the part you skipped"
                  onClick={() =>
                    window.scrollTo({
                      top: Math.max(
                        0,
                        scroll.top +
                          (gap[0] / STEPS) * shape.height -
                          window.innerHeight * EYE
                      ),
                      behavior: 'smooth',
                    })
                  }
                >
                  Skipped a part
                </FootButton>
              </>
            )}
          </Foot>
        )}
        {unfolds && unfolded && (
          <Panel role="dialog" aria-label="Contents">
            {contents(false)}
          </Panel>
        )}
      </Root>
      {sheetView}
    </>
  )
}
