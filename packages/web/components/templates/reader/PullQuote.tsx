import {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { styled } from '../../tokens/stitches.config'

// A pull quote, as a magazine sets one: a line from the article, larger and
// in italic, hung in the margin beside the paragraph it comes from. Your own
// highlight is used when you have one; otherwise the reader picks a line
// that reads well on its own. Where there's no margin, the quote sits
// between paragraphs instead.
//
// Like the margin notes, it never changes the article's own text: in the
// margin it is a layer beside the text, and between paragraphs it is drawn
// from an attribute.

const WIDTH = 210
const MIN_WIDTH = 170
const GAP = 32

const Layer = styled('div', {
  position: 'absolute',
  top: 0,
  left: '100%',
  width: 0,
  height: 0,
  pointerEvents: 'none',
  '@media print': { display: 'none' },
})

const Quote = styled('aside', {
  position: 'absolute',
  left: `${GAP}px`,
  display: 'grid',
  gap: '10px',
  '&::before': {
    content: '""',
    width: '22px',
    height: '2px',
    background: '$stAccent',
  },
})

const Words = styled('p', {
  margin: 0,
  fontFamily: 'var(--text-font-family)',
  fontStyle: 'italic',
  fontSize: '19px',
  lineHeight: 1.32,
  color: 'var(--font-color)',
  textWrap: 'pretty',
})

const Label = styled('div', {
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--font-color-muted)',
})

const PROSE =
  'blockquote, figure, figcaption, li, table, aside, pre, h1, h2, h3'

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

const proseParagraphs = (root: HTMLElement): HTMLParagraphElement[] =>
  Array.from(root.querySelectorAll('p')).filter(
    (p) => !p.closest(PROSE) && clean(p.textContent ?? '').length >= 160
  )

// How well a sentence stands alone as a pull quote.
const score = (sentence: string): number => {
  const length = sentence.length
  if (length < 70 || length > 170) return 0
  if (!/^["“]?[A-Z]/.test(sentence)) return 0
  if (
    /https?:|www\.|\d{3,}|[()[\]{}|]|^(But|And|So|Or|This|That|These|It)\b/.test(
      sentence
    )
  )
    return 0
  let points = 1
  if (/[“”"]/.test(sentence)) points += 1
  if (/\b(we|you|our|never|always|every|nothing|everything)\b/i.test(sentence))
    points += 0.5
  // Shorter lines read better large.
  points += (170 - length) / 200
  return points
}

const sentences = (text: string): string[] =>
  clean(text)
    .split(/(?<=[.!?][”"’]?)\s+(?=["“]?[A-Z])/)
    .map((sentence) => sentence.trim())

type Pick = { text: string; paragraph: HTMLParagraphElement; mine: boolean }

const pick = (root: HTMLElement, highlights: string[]): Pick | undefined => {
  const paragraphs = proseParagraphs(root)
  if (paragraphs.length < 8) return undefined
  const usable = (p: HTMLParagraphElement) => !p.classList.contains('st-end')

  // Your own highlight first: the one closest to a good pull-quote length.
  const mine = highlights
    .map(clean)
    .filter((quote) => quote.length >= 40 && quote.length <= 220)
    .sort((a, b) => Math.abs(a.length - 120) - Math.abs(b.length - 120))
  for (const quote of mine) {
    const probe = quote.slice(0, 60)
    const paragraph = paragraphs.find(
      (p) => usable(p) && clean(p.textContent ?? '').includes(probe)
    )
    if (paragraph) return { text: quote, paragraph, mine: true }
  }

  // Otherwise the best line from the middle of the piece.
  let best: Pick | undefined
  let bestScore = 0
  const start = Math.floor(paragraphs.length * 0.25)
  const end = Math.ceil(paragraphs.length * 0.65)
  paragraphs.slice(start, end).forEach((paragraph) => {
    if (!usable(paragraph)) return
    sentences(paragraph.textContent ?? '').forEach((sentence) => {
      const points = score(sentence)
      if (points > bestScore) {
        bestScore = points
        best = { text: sentence, paragraph, mine: false }
      }
    })
  })
  return best
}

const quoted = (text: string) =>
  /^["“]/.test(text) ? text : `“${text.replace(/[.,;:]$/, '')}”`

type PullQuoteProps = {
  contentRef: MutableRefObject<HTMLDivElement | null>
  // Changes when the article's HTML is replaced.
  contentKey: string
  highlights: string[]
}

export function PullQuote(props: PullQuoteProps): JSX.Element | null {
  const [chosen, setChosen] = useState<Pick | undefined>()
  const [inMargin, setInMargin] = useState(false)
  const [width, setWidth] = useState(WIDTH)
  const layerRef = useRef<HTMLDivElement | null>(null)
  const quoteRef = useRef<HTMLElement | null>(null)
  // The highlights when the article opened; new ones don't move the quote.
  const [highlights] = useState(props.highlights)

  useEffect(() => {
    const root = props.contentRef.current
    if (!root) return
    // Wait for the margin notes to mark the lede, breaks and end.
    const timer = setTimeout(() => setChosen(pick(root, highlights)), 200)
    return () => {
      clearTimeout(timer)
      setChosen(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.contentRef, props.contentKey])

  const layout = useCallback(() => {
    const root = props.contentRef.current
    const layer = layerRef.current
    const container = layer?.parentElement
    if (!chosen || !root || !container) return
    const wrapper = document.getElementById('article-wrapper')
    const containerRect = container.getBoundingClientRect()
    let right = window.innerWidth
    if (wrapper) {
      right =
        wrapper.getBoundingClientRect().right -
        parseFloat(getComputedStyle(wrapper).paddingRight)
    }
    const room = right - containerRect.right - GAP - 24
    // Footnotes already use the margin; then the quote goes inline.
    const fits = room >= MIN_WIDTH && !root.querySelector('.st-fnref')
    setInMargin(fits)
    setWidth(Math.min(WIDTH, Math.max(MIN_WIDTH, room)))
    if (fits && quoteRef.current) {
      const top =
        chosen.paragraph.getBoundingClientRect().top - containerRect.top + 4
      quoteRef.current.style.top = `${top}px`
    }
  }, [chosen, props.contentRef])

  useEffect(() => {
    if (!chosen) return
    layout()
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(layout)
    }
    const observer = new ResizeObserver(schedule)
    if (props.contentRef.current) observer.observe(props.contentRef.current)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [chosen, layout, props.contentRef])

  // Between paragraphs, the quote is drawn by CSS from this attribute.
  useEffect(() => {
    if (!chosen || inMargin) return
    const paragraph = chosen.paragraph
    paragraph.dataset.stPull = quoted(chosen.text)
    return () => {
      delete paragraph.dataset.stPull
    }
  }, [chosen, inMargin])

  if (!chosen) return null

  return (
    <Layer ref={layerRef} aria-hidden="true">
      {inMargin && (
        <Quote ref={quoteRef} style={{ width: `${width}px` }}>
          <Words>{quoted(chosen.text)}</Words>
          {chosen.mine && <Label>Your highlight</Label>}
        </Quote>
      )}
    </Layer>
  )
}
