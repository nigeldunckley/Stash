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

// The margin map: the whole article drawn small down the right edge of the
// window. Every paragraph is a few hairlines, headings get tiny labels,
// pictures are grey blocks and your highlights are orange ticks. A bracket
// shows the screen you're on; hover for a preview, click or drag to travel.
//
// On a wide window it is always there. On a phone it appears while you
// scroll quickly, as a scrubber, and steps away when you stop.

// Width the map takes from the right margin, so margin notes and pull
// quotes can leave room for it.
export const MAP_ROOM = 84
const WIDE = 1100
const PHONE = 760
const WIDTH = 44
const LINE_GAP = 3

const BLOCKS =
  'p, h1, h2, h3, h4, blockquote, figure, img, pre, ul, ol, table, iframe'

type Block = {
  kind: 'text' | 'heading' | 'picture' | 'quote'
  top: number
  height: number
  label?: string
  preview: string
}

type Shape = {
  blocks: Block[]
  highlights: number[]
  height: number
}

// Whether the map is showing in the margin at this window width.
export const marginMapShown = (): boolean =>
  typeof window !== 'undefined' &&
  window.innerWidth >= WIDE &&
  document.body.dataset.notebook != 'open'

const Root = styled('div', {
  position: 'fixed',
  top: '96px',
  right: '18px',
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
  '&[data-hidden]': { opacity: 0, pointerEvents: 'none' },
})

const Track = styled('div', {
  position: 'relative',
  cursor: 'pointer',
  touchAction: 'none',
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
  right: '-12px',
  fontFamily: '$mono',
  fontSize: '7.5px',
  lineHeight: '9px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: 'var(--font-color)',
  background: '$readerBg',
  pointerEvents: 'none',
})

const Bracket = styled('div', {
  position: 'absolute',
  left: '-6px',
  right: '-6px',
  border: '1px solid var(--font-color)',
  borderRadius: '3px',
  background: 'color-mix(in srgb, var(--font-color) 4%, transparent)',
  pointerEvents: 'none',
})

const Place = styled('div', {
  position: 'absolute',
  left: '-16px',
  lineHeight: 0,
  pointerEvents: 'none',
})

const Foot = styled('div', {
  marginTop: '12px',
  paddingTop: '10px',
  borderTop: '1px solid $stLine',
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

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

const measure = (root: HTMLElement): Shape => {
  const origin = root.getBoundingClientRect().top
  const blocks: Block[] = []
  root.querySelectorAll<HTMLElement>(BLOCKS).forEach((element) => {
    const outer = element.parentElement?.closest(BLOCKS)
    if (outer && root.contains(outer)) return
    const rect = element.getBoundingClientRect()
    if (rect.height < 2 || getComputedStyle(element).display == 'none') return
    const tag = element.tagName
    const text = clean(element.textContent ?? '')
    const kind: Block['kind'] = /^H[1-4]$/.test(tag)
      ? 'heading'
      : tag == 'BLOCKQUOTE'
      ? 'quote'
      : /^(FIGURE|IMG|IFRAME)$/.test(tag) ||
        (!text && element.querySelector('img'))
      ? 'picture'
      : 'text'
    if (kind == 'text' && !text) return
    blocks.push({
      kind,
      top: rect.top - origin,
      height: rect.height,
      label: kind == 'heading' ? text : undefined,
      preview: text.slice(0, 220),
    })
  })
  const seen = new Set<string>()
  const highlights: number[] = []
  root
    .querySelectorAll<HTMLElement>('[omnivore-highlight-id]')
    .forEach((element) => {
      const id = element.getAttribute('omnivore-highlight-id') ?? ''
      if (seen.has(id)) return
      seen.add(id)
      highlights.push(element.getBoundingClientRect().top - origin)
    })
  return { blocks, highlights, height: root.scrollHeight }
}

// A paragraph's last line is a little short, the way text really ends.
const lastLine = (index: number) => 40 + ((index * 37) % 50)

type MarginMapProps = {
  contentRef: MutableRefObject<HTMLDivElement | null>
  contentKey: string
  wordsCount?: number
  // Where you were when the article opened, as a percentage.
  resumeProgress?: number
}

export function MarginMap(props: MarginMapProps): JSX.Element | null {
  const [shape, setShape] = useState<Shape | undefined>()
  const [mode, setMode] = useState<'wide' | 'phone' | 'none'>('none')
  const [scroll, setScroll] = useState({ y: 0, view: 800, top: 0 })
  const [awake, setAwake] = useState(false)
  const [hover, setHover] = useState<number | undefined>()
  const [resume] = useState(() => props.resumeProgress ?? 0)
  const dragging = useRef(false)
  const trackRef = useRef<HTMLDivElement | null>(null)

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
  useEffect(() => {
    if (mode == 'none') return
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
  }, [mode, props.contentRef])

  const height = useMemo(() => {
    if (!shape) return 0
    const room = window.innerHeight - (mode == 'phone' ? 220 : 190)
    return Math.max(80, Math.min(room, shape.height * 0.2))
  }, [shape, mode])
  const scale = shape ? height / Math.max(1, shape.height) : 0

  const lines = useMemo(() => {
    if (!shape) return []
    const out: { y: number; w: number; x: number; heading?: boolean }[] = []
    shape.blocks.forEach((block, index) => {
      if (block.kind == 'picture') return
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
    if (!shape || mode == 'phone') return []
    let floor = -Infinity
    return shape.blocks
      .filter((block) => block.kind == 'heading')
      .map((block) => ({ y: block.top * scale, text: block.label ?? '' }))
      .filter((label) => {
        if (label.y < floor) return false
        floor = label.y + 12
        return true
      })
  }, [shape, scale, mode])

  const travel = useCallback(
    (clientY: number, smooth: boolean) => {
      const track = trackRef.current
      if (!track || !scale) return
      const y = (clientY - track.getBoundingClientRect().top) / scale
      window.scrollTo({
        top: scroll.top + y - window.innerHeight * 0.3,
        behavior: smooth ? 'smooth' : 'auto',
      })
    },
    [scale, scroll.top]
  )

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (dragging.current) travel(event.clientY, false)
    }
    const up = () => {
      dragging.current = false
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [travel])

  if (!shape || mode == 'none' || shape.height < 2.5 * scroll.view) {
    return null
  }

  const bracketTop = Math.max(0, (scroll.y - scroll.top + 84) * scale)
  const bracketHeight = Math.max(8, (scroll.view - 84) * scale)
  const readTo = Math.min(height, bracketTop + bracketHeight)
  const done = Math.min(
    1,
    Math.max(0, (scroll.y + scroll.view - scroll.top) / shape.height)
  )
  const total = readingMinutes(props.wordsCount)
  const left =
    total !== undefined
      ? formatMinutes(Math.round(total * (1 - done)))
      : undefined

  // What's under the pointer: its section and its opening words.
  let preview: { section: string; text: string; at: string } | undefined
  if (hover !== undefined && mode == 'wide') {
    const y = hover / scale
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

  const draw = (color: string, headingColor: string) => (
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
      {shape.blocks
        .filter((block) => block.kind == 'picture')
        .map((block, index) => (
          <rect
            key={`p${index}`}
            x="0"
            y={block.top * scale}
            width="100%"
            height={Math.max(2, block.height * scale - 1)}
            rx="1"
            fill={color}
            opacity="0.6"
          />
        ))}
      {shape.highlights.map((y, index) => (
        <rect
          key={`h${index}`}
          x="0"
          y={y * scale}
          width="100%"
          height="2"
          fill="var(--colors-stAccent)"
        />
      ))}
    </Lines>
  )

  const hidden = mode == 'phone' && !awake

  return (
    <Root
      data-phone={mode == 'phone' ? '' : undefined}
      data-hidden={hidden ? '' : undefined}
      aria-hidden="true"
    >
      <Track
        ref={trackRef}
        style={{ height: `${height}px` }}
        onPointerDown={(event: ReactMouseEvent<HTMLDivElement>) => {
          dragging.current = true
          travel(event.clientY, mode == 'wide')
        }}
        onMouseMove={(event) =>
          setHover(
            event.clientY - event.currentTarget.getBoundingClientRect().top
          )
        }
        onMouseLeave={() => setHover(undefined)}
      >
        {draw(
          'color-mix(in srgb, var(--font-color) 16%, transparent)',
          'color-mix(in srgb, var(--font-color) 40%, transparent)'
        )}
        <Read style={{ height: `${readTo}px` }}>
          {draw(
            'color-mix(in srgb, var(--font-color) 42%, transparent)',
            'var(--font-color)'
          )}
        </Read>
        {labels.map((label, index) => (
          <Label key={index} style={{ top: `${label.y + 3}px` }}>
            {label.text}
          </Label>
        ))}
        <Bracket
          style={{
            top: `${bracketTop - 3}px`,
            height: `${bracketHeight + 6}px`,
          }}
        />
        {resume >= 3 && resume <= 97 && mode == 'wide' && (
          <Place style={{ top: `${(resume / 100) * height - 4}px` }}>
            <Ribbon width={7} height={16} />
          </Place>
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
          {shape.highlights.length > 0 &&
            `${shape.highlights.length} highlight${
              shape.highlights.length == 1 ? '' : 's'
            }`}
        </Foot>
      )}
    </Root>
  )
}
