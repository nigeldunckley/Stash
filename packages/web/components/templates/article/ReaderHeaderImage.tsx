import { useEffect, useState } from 'react'
import { styled } from '../../tokens/stitches.config'
import { motion } from '../../elements/stash/motion'

const Figure = styled('figure', {
  width: '100%',
  margin: '8px 0 28px',
  overflow: 'hidden',
  borderRadius: '$md',
  background: 'color-mix(in srgb, var(--font-color) 6%, transparent)',
  img: {
    display: 'block',
    width: '100%',
    height: 'auto',
    maxHeight: '62vh',
    objectFit: 'cover',
    opacity: 0,
    transition: `opacity ${motion.slow}`,
  },
  '&[data-loaded="true"] img': { opacity: 1 },
  '@mdDown': { margin: '4px 0 22px', borderRadius: '$sm' },
  '@media print': { display: 'none' },
})

// Images often come back through the image proxy as
// https://host/images/<size>,s<signature>/<original url>, and sites serve one
// picture at several sizes (photo-1200x630.jpg, photo@2x.webp) or from
// another host. Compare paths with those parts removed so copies of one
// picture match.
export function imageKey(src: string): string {
  const proxied = src.match(/\/[^/]*,s[^/]+\/(https?:\/\/?.+)$/)
  const url = (proxied ? proxied[1] : src).replace(/^https?:\/\/?[^/]+/i, '')
  const [path, query = ''] = url.split('#')[0].split('?')
  const file = path.split('/').pop() ?? ''
  const stem = file
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/(-|_)?(\d+x\d+|scaled|large|medium)$/, '')
    .replace(/@\dx$/, '')
  const dir = path.slice(0, path.length - file.length).toLowerCase()
  // Without a file extension the query usually names the picture.
  return dir + stem + (/\.[a-z0-9]+$/i.test(file) ? '' : `?${query}`)
}

// How much text may come before a copy of the header image in the body for it
// to still count as the article's lead picture.
const LEAD_TEXT = 280

type ReaderHeaderImageProps = {
  src?: string
  // Matches against the article's own images so the lead one isn't shown twice.
  thumbnail?: string
}

// A wide picture at the top of the article, taken from the page's share image
// or its largest picture. When the article body opens with that same picture,
// the copy in the body is hidden.
export function ReaderHeaderImage(
  props: ReaderHeaderImageProps
): JSX.Element | null {
  const [failedSrc, setFailedSrc] = useState<string>()
  const [loadedSrc, setLoadedSrc] = useState<string>()
  const failed = !!props.src && failedSrc === props.src

  useEffect(() => {
    if (!props.src || failed) {
      return
    }
    const keys = new Set(
      [props.src, props.thumbnail]
        .map((src) => (src ? imageKey(src) : ''))
        .filter(Boolean)
    )
    const hidden: HTMLElement[] = []
    const dedupe = () => {
      const body = document.querySelector('.article-inner-css')
      if (!body) {
        return false
      }
      const lead = body.querySelector('img')
      if (!lead) {
        return true
      }
      // Only a picture before the article really starts counts as its lead.
      const before = document.createRange()
      before.setStart(body, 0)
      before.setEndBefore(lead)
      if (before.toString().trim().length > LEAD_TEXT) {
        return true
      }
      const src =
        lead.currentSrc || lead.getAttribute('src') || lead.dataset.src || ''
      const key = src && imageKey(src)
      if (key && keys.has(key)) {
        const target = (lead.closest('figure, picture') as HTMLElement) ?? lead
        target.style.display = 'none'
        hidden.push(target)
      }
      return true
    }
    // The body renders after this header; try again once it is in place.
    let frame = 0
    if (!dedupe()) {
      frame = requestAnimationFrame(() => dedupe())
    }
    return () => {
      cancelAnimationFrame(frame)
      hidden.forEach((element) => (element.style.display = ''))
    }
  }, [props.src, props.thumbnail, failed])

  if (!props.src || failed) {
    return null
  }

  return (
    <Figure data-loaded={loadedSrc === props.src} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={props.src}
        alt=""
        decoding="async"
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) {
            setLoadedSrc(props.src)
          }
        }}
        onLoad={() => setLoadedSrc(props.src)}
        onError={() => setFailedSrc(props.src)}
      />
    </Figure>
  )
}
