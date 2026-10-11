import { CSSProperties, ReactNode, useState } from 'react'
import { styled } from '../../tokens/stitches.config'
import { motion, reducedMotion } from './motion'

const Frame = styled('span', {
  display: 'block',
  position: 'relative',
  overflow: 'hidden',
  flex: 'none',
  background: '$stSunken',
  // A hairline inside the edge keeps white images from bleeding into the page.
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.06)',
    pointerEvents: 'none',
  },
  img: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: 0,
    // Pictures settle into place as they fade in, rather than popping.
    transform: 'scale(1.03)',
    transition: `opacity ${motion.slow}, transform ${motion.slow}`,
    [reducedMotion]: {
      transform: 'none',
      transition: `opacity ${motion.fast}`,
    },
  },
  '&[data-loaded="true"] img': { opacity: 1, transform: 'none' },
})

type CoverImageProps = {
  src?: string
  // Shown in the frame when there is no image or it fails to load. Without
  // one, nothing renders in that case.
  fallback?: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

// An item's picture, cropped to fill its frame. It fades in once loaded and
// steps aside (or shows the fallback) when the image is missing or broken.
export function CoverImage(props: CoverImageProps): JSX.Element | null {
  const [failedSrc, setFailedSrc] = useState<string>()
  const [loadedSrc, setLoadedSrc] = useState<string>()
  const usable = !!props.src && failedSrc !== props.src

  if (!usable && !props.fallback) {
    return null
  }

  return (
    <Frame
      aria-hidden="true"
      className={props.className}
      style={props.style}
      onClick={props.onClick}
      data-loaded={usable && loadedSrc === props.src}
    >
      {usable ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.src}
          alt=""
          loading="lazy"
          decoding="async"
          // A cached image can finish before React attaches onLoad.
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) {
              setLoadedSrc(props.src)
            }
          }}
          onLoad={() => setLoadedSrc(props.src)}
          onError={() => setFailedSrc(props.src)}
        />
      ) : (
        props.fallback
      )}
    </Frame>
  )
}
