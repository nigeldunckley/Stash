import { useState } from 'react'
import { styled } from '../../tokens/stitches.config'

const Tile = styled('span', {
  display: 'inline-grid',
  placeItems: 'center',
  flex: 'none',
  overflow: 'hidden',
  background: '$stSunken',
  border: '1px solid $stLine',
  color: '$stInk2',
  fontFamily: '$mono',
  fontWeight: 500,
  lineHeight: 1,
  img: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
})

type SiteIconProps = {
  src?: string
  // Tried when src is missing or fails to load, such as the site's own
  // /favicon.ico.
  fallbackSrc?: string
  name?: string
  size?: number
  // Round, for people and YouTube channels rather than sites.
  round?: boolean
}

// A site's favicon, or the first letter of its name on a neutral tile.
export const SiteIcon = (props: SiteIconProps): JSX.Element => {
  const size = props.size ?? 18
  const sources = [props.src, props.fallbackSrc].filter(
    (src): src is string => !!src
  )
  const [failed, setFailed] = useState<string[]>([])
  const src = sources.find((source) => !failed.includes(source))
  const letter = (props.name ?? '').trim().charAt(0).toLocaleUpperCase()
  return (
    <Tile
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: props.round ? '50%' : Math.max(3, Math.round(size / 4.5)),
        fontSize: Math.round(size * 0.55),
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          onError={() => setFailed((current) => [...current, src])}
        />
      ) : (
        letter
      )}
    </Tile>
  )
}
