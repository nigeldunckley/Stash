import { X } from '@phosphor-icons/react'
import {
  MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { MAP_ROOM, marginMapShown } from './MarginMap'
import { styled } from '../../tokens/stitches.config'
import { motion } from '../../elements/stash/motion'

// Footnotes beside the text. On a wide screen each note sits in the margin
// next to the line that cites it; on a narrow one, tapping the number opens
// the note at the bottom of the screen instead of jumping away from the text.
//
// The article's own HTML is never changed beyond attributes and classes, so
// highlight positions (which count text) stay valid.

const NOTE_WIDTH = 220
const MIN_NOTE_WIDTH = 160
const GAP = 28
const MAX_NOTE_LENGTH = 600

type Note = {
  id: string
  label: string
  text: string
  ref: HTMLAnchorElement
}

const Layer = styled('div', {
  position: 'absolute',
  top: 0,
  left: '100%',
  width: 0,
  height: 0,
  '@media print': { display: 'none' },
})

const MarginNote = styled('aside', {
  position: 'absolute',
  left: `${GAP}px`,
  fontFamily: '$inter',
  fontSize: '12.5px',
  lineHeight: 1.5,
  color: 'var(--font-color-muted)',
  borderRadius: '$sm',
  transition: `background ${motion.fast}, color ${motion.fast}`,
  '&[data-active="true"]': { color: 'var(--font-color)' },
})

const NoteNumber = styled('span', {
  fontFamily: '$mono',
  color: '$stAccentText',
  marginRight: '6px',
})

const Sheet = styled('div', {
  position: 'fixed',
  left: '16px',
  right: '16px',
  bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
  zIndex: 20,
  maxWidth: '560px',
  margin: '0 auto',
  maxHeight: '45vh',
  overflowY: 'auto',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '12px',
  alignItems: 'start',
  padding: '14px 14px 14px 16px',
  fontFamily: '$inter',
  fontSize: '14px',
  lineHeight: 1.5,
  color: '$stInk',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$md',
  boxShadow: '0 18px 40px -20px rgba(9, 9, 11, 0.45)',
  '@media print': { display: 'none' },
})

const Close = styled('button', {
  all: 'unset',
  display: 'grid',
  placeItems: 'center',
  width: '28px',
  height: '28px',
  margin: '-4px -4px 0 0',
  borderRadius: '$sm',
  color: '$stMuted',
  cursor: 'pointer',
  '&:hover': { background: '$stSunken', color: '$stInk' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
})

const BACK_LINK = /^[\s↩↑⤴︎^]+$|^\s*(back|return)\b/i

// The text of a footnote, without its back link or a repeated number.
const noteText = (element: Element, label: string): string => {
  const copy = element.cloneNode(true) as Element
  copy.querySelectorAll('a').forEach((link) => {
    if (BACK_LINK.test(link.textContent ?? '')) {
      link.remove()
    }
  })
  let text = (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
  const bare = label.replace(/[[\]()]/g, '')
  text = text
    .replace(
      new RegExp(
        `^\\[?${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?[.:)]?\\s+`
      ),
      ''
    )
    .replace(/[\s↩↑⤴︎]+$/, '')
  return text.length > MAX_NOTE_LENGTH
    ? text.slice(0, MAX_NOTE_LENGTH).replace(/\s+\S*$/, '') + '…'
    : text
}

const withoutFragment = (url: string): string =>
  url
    .split('#')[0]
    .replace(/\/+$/, '')
    .replace(/^https?:\/\/(www\.)?/, '')

// Only links to this same page count: a bare #fragment, or the article's
// own address with one (extraction makes links absolute).
const targetFor = (
  root: HTMLElement,
  href: string,
  pageUrls: string[]
): Element | null => {
  const at = href.indexOf('#')
  if (at == -1 || at == href.length - 1) {
    return null
  }
  if (
    at > 0 &&
    !pageUrls.some((url) => withoutFragment(url) == withoutFragment(href))
  ) {
    return null
  }
  let id = href.slice(at + 1)
  try {
    id = decodeURIComponent(id)
  } catch {
    // Use it as written.
  }
  const escaped = id.replace(/["\\]/g, '\\$&')
  return root.querySelector(`[id="${escaped}"], a[name="${escaped}"]`)
}

const looksLikeReference = (link: HTMLAnchorElement): boolean => {
  const label = (link.textContent ?? '').trim()
  if (!label || label.length > 5) {
    return false
  }
  return !!link.closest('sup') || /^\[?\d+\]?$|^[*†‡§]$/.test(label)
}

// Finds footnote references, and quietly fixes the article's other
// same-page links so they scroll here instead of opening a new tab.
const collectNotes = (root: HTMLElement, pageUrls: string[]): Note[] => {
  const notes: Note[] = []
  root.querySelectorAll<HTMLAnchorElement>('a[href*="#"]').forEach((link) => {
    const target = targetFor(root, link.getAttribute('href') ?? '', pageUrls)
    if (!target) {
      return
    }
    link.removeAttribute('target')
    link.dataset.stSamePage = 'true'
    if (!looksLikeReference(link)) {
      return
    }
    const holder =
      target.closest('li, dd, p, aside, div[id]') ?? target.parentElement
    if (!holder || holder.contains(link)) {
      return
    }
    // Footnotes follow the text that cites them.
    if (
      !(link.compareDocumentPosition(holder) & Node.DOCUMENT_POSITION_FOLLOWING)
    ) {
      return
    }
    const label = (link.textContent ?? '').trim().replace(/[[\]]/g, '')
    const text = noteText(holder, label)
    if (!text) {
      return
    }
    link.classList.add('st-fnref')
    link.dataset.stNote = String(notes.length)
    notes.push({ id: String(notes.length), label, text, ref: link })
  })
  return notes
}

// Marks the opening paragraph, but only a real paragraph of prose.
const markLede = (root: HTMLElement) => {
  root.querySelector('p.st-lede')?.classList.remove('st-lede')
  const first = Array.from(root.querySelectorAll('p'))
    .slice(0, 4)
    .find(
      (p) =>
        (p.textContent ?? '').trim().length >= 120 &&
        !p.closest('blockquote, figure, li, table, aside, pre')
    )
  first?.classList.add('st-lede')
  // A drop cap needs a letter to start on and three lines to sit in.
  root.querySelector('p.st-drop')?.classList.remove('st-drop')
  const text = (first?.textContent ?? '').trim()
  if (first && text.length >= 220 && /^["“‘']?\p{L}/u.test(text)) {
    first.classList.add('st-drop')
  }
}

// Rows of asterisks, dots or the like between sections become the same
// orange square as a real section break.
const BREAK = /^[\s*•·⁂∗✻★☆◆◇~#=_\-–—]{1,24}$/
const markBreaks = (root: HTMLElement) => {
  root.querySelectorAll('p').forEach((p) => {
    const text = (p.textContent ?? '').trim()
    if (text && BREAK.test(text) && /[*•·⁂∗✻★☆◆◇~#]/.test(text)) {
      p.classList.add('st-break')
    }
  })
}

// The last real paragraph of prose gets the end mark. Anything after it
// that isn't prose (a bio in a list, a caption, a share box) is skipped.
const markEnd = (root: HTMLElement) => {
  root.querySelector('p.st-end')?.classList.remove('st-end')
  const last = Array.from(root.querySelectorAll('p'))
    .reverse()
    .find(
      (p) =>
        (p.textContent ?? '').trim().length >= 40 &&
        !p.closest('blockquote, figure, figcaption, li, table, aside, pre')
    )
  last?.classList.add('st-end')
}

type MarginNotesProps = {
  contentRef: MutableRefObject<HTMLDivElement | null>
  // Changes when the article's HTML is replaced.
  contentKey: string
  // The article's own addresses, to tell same-page links from others.
  pageUrls: string[]
}

export function MarginNotes(props: MarginNotesProps): JSX.Element | null {
  const [notes, setNotes] = useState<Note[]>([])
  const [inMargin, setInMargin] = useState(false)
  const [width, setWidth] = useState(NOTE_WIDTH)
  const [open, setOpen] = useState<Note | undefined>()
  const [active, setActive] = useState<string | undefined>()
  const layerRef = useRef<HTMLDivElement | null>(null)
  const noteRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    const root = props.contentRef.current
    if (!root) {
      return
    }
    markLede(root)
    markBreaks(root)
    markEnd(root)
    setNotes(collectNotes(root, props.pageUrls))
    setOpen(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.contentRef, props.contentKey])

  // Decide whether there is room in the margin, then line each note up with
  // its reference, pushing a note down when the one above runs long.
  const layout = useCallback(() => {
    const layer = layerRef.current
    const root = props.contentRef.current
    const container = layer?.parentElement
    if (!layer || !root || !container || notes.length == 0) {
      return
    }
    const wrapper = document.getElementById('article-wrapper')
    const containerRect = container.getBoundingClientRect()
    let right = window.innerWidth
    if (wrapper) {
      const wrapperRect = wrapper.getBoundingClientRect()
      right =
        wrapperRect.right - parseFloat(getComputedStyle(wrapper).paddingRight)
    }
    // The margin map takes the outer edge when it's showing.
    const room =
      right - containerRect.right - GAP - 24 - (marginMapShown() ? MAP_ROOM : 0)
    const fits = room >= MIN_NOTE_WIDTH
    setInMargin(fits)
    setWidth(Math.min(NOTE_WIDTH, Math.max(MIN_NOTE_WIDTH, room)))
    if (!fits) {
      return
    }
    let floor = 0
    notes.forEach((note, index) => {
      const element = noteRefs.current[index]
      if (!element) {
        return
      }
      const want = note.ref.getBoundingClientRect().top - containerRect.top - 3
      const top = Math.max(want, floor)
      element.style.top = `${top}px`
      floor = top + element.offsetHeight + 14
    })
  }, [notes, props.contentRef])

  useLayoutEffect(() => {
    layout()
  }, [layout, inMargin, width])

  useEffect(() => {
    const root = props.contentRef.current
    if (!root || notes.length == 0) {
      return
    }
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(layout)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    const wrapper = document.getElementById('article-wrapper')
    if (wrapper) {
      observer.observe(wrapper)
    }
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [layout, notes, props.contentRef])

  // Footnote numbers open their note; other same-page links scroll.
  useEffect(() => {
    const root = props.contentRef.current
    if (!root) {
      return
    }
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a')
      if (!link || !root.contains(link) || !link.dataset.stSamePage) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const index = link.dataset.stNote
      if (index !== undefined) {
        const note = notes[Number(index)]
        if (!note) {
          return
        }
        if (inMargin) {
          setActive(note.id)
        } else {
          setOpen((current) => (current?.id == note.id ? undefined : note))
        }
        return
      }
      targetFor(
        root,
        link.getAttribute('href') ?? '',
        props.pageUrls
      )?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
    root.addEventListener('click', onClick, true)
    return () => root.removeEventListener('click', onClick, true)
  }, [notes, inMargin, props.contentRef, props.pageUrls])

  useEffect(() => {
    if (!active) {
      return
    }
    const timer = setTimeout(() => setActive(undefined), 1600)
    return () => clearTimeout(timer)
  }, [active])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key == 'Escape') {
        setOpen(undefined)
      }
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target?.closest?.('[data-st-note-sheet], a.st-fnref')) {
        setOpen(undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  if (notes.length == 0) {
    return null
  }

  return (
    <>
      <Layer ref={layerRef} aria-label="Footnotes">
        {inMargin &&
          notes.map((note, index) => (
            <MarginNote
              key={note.id}
              ref={(element) => {
                noteRefs.current[index] = element
              }}
              data-active={active == note.id}
              style={{ width }}
            >
              <NoteNumber>{note.label}</NoteNumber>
              {note.text}
            </MarginNote>
          ))}
      </Layer>
      {!inMargin && open && (
        <Sheet data-st-note-sheet role="note" aria-live="polite">
          <div>
            <NoteNumber>{open.label}</NoteNumber>
            {open.text}
          </div>
          <Close
            type="button"
            aria-label="Close note"
            onClick={() => setOpen(undefined)}
          >
            <X size={16} />
          </Close>
        </Sheet>
      )}
    </>
  )
}
