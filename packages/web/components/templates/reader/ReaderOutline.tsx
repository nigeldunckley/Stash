import { useEffect, useState } from 'react'
import { styled } from '../../tokens/stitches.config'
import { motion } from '../../elements/stash/motion'

const Nav = styled('nav', {
  position: 'fixed',
  top: '132px',
  left: 'max(24px, calc(50vw - var(--reader-column, 760px) / 2 - 236px))',
  width: '196px',
  maxHeight: 'calc(100vh - 200px)',
  overflowY: 'auto',
  zIndex: 2,
  display: 'none',
  fontFamily: '$inter',
  '@media (min-width: 1280px)': { display: 'grid' },
  alignContent: 'start',
  gap: '2px',
  '@media print': { display: 'none' },
  // The notebook takes the right side, so the outline steps aside.
  'body[data-notebook="open"] &': { display: 'none' },
})

const Heading = styled('div', {
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: '$stMuted',
  marginBottom: '8px',
})

const Entry = styled('a', {
  display: 'block',
  padding: '3px 0 3px 10px',
  borderLeft: '2px solid transparent',
  fontSize: '$caption',
  lineHeight: 1.4,
  color: '$stMuted',
  textDecoration: 'none',
  transition: `color ${motion.fast}, border-color ${motion.fast}`,
  '&:hover': { color: '$stInk' },
  '&[aria-current="true"]': {
    color: '$stInk',
    borderLeftColor: '$stAccent',
  },
  variants: {
    level: {
      3: { paddingLeft: '20px' },
    },
  },
})

type OutlineEntry = {
  id: string
  text: string
  level: 2 | 3
}

const slug = (text: string, index: number) =>
  `stash-section-${index}-${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)}`

// A list of the article's headings on wide screens, with the current section
// marked. Shown only when the article has at least three headings.
export function ReaderOutline(props: {
  contentKey: string
}): JSX.Element | null {
  const [entries, setEntries] = useState<OutlineEntry[]>([])
  const [current, setCurrent] = useState<string | undefined>()

  useEffect(() => {
    let observer: IntersectionObserver | undefined
    const collect = () => {
      const container = document.querySelector(
        '#readability-page-1, #article-container'
      )
      if (!container) return false
      const headings = Array.from(
        container.querySelectorAll<HTMLElement>('h2, h3')
      ).filter((h) => (h.textContent ?? '').trim().length > 0)
      const found = headings.map((heading, index) => {
        if (!heading.id) heading.id = slug(heading.textContent ?? '', index)
        return {
          id: heading.id,
          text: (heading.textContent ?? '').trim(),
          level: heading.tagName === 'H3' ? 3 : 2,
        } as OutlineEntry
      })
      setEntries(found.length >= 3 ? found : [])
      if (found.length >= 3) {
        observer = new IntersectionObserver(
          (records) => {
            const visible = records
              .filter((r) => r.isIntersecting)
              .sort(
                (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
              )
            if (visible[0]) setCurrent(visible[0].target.id)
          },
          { rootMargin: '-80px 0px -65% 0px' }
        )
        headings.forEach((h) => observer?.observe(h))
      }
      return found.length > 0
    }
    // The article body renders after the page, so retry briefly.
    let tries = 0
    const timer = window.setInterval(() => {
      if (collect() || ++tries > 20) window.clearInterval(timer)
    }, 250)
    return () => {
      window.clearInterval(timer)
      observer?.disconnect()
    }
  }, [props.contentKey])

  if (entries.length < 3) {
    return null
  }

  return (
    <Nav aria-label="Outline">
      <Heading>Outline</Heading>
      {entries.map((entry) => (
        <Entry
          key={entry.id}
          href={`#${entry.id}`}
          level={entry.level === 3 ? 3 : undefined}
          aria-current={entry.id === current}
          onClick={(event) => {
            event.preventDefault()
            document.getElementById(entry.id)?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          }}
        >
          {entry.text}
        </Entry>
      ))}
    </Nav>
  )
}
