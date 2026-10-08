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
  name?: string
  size?: number
}

// A site's favicon, or the first letter of its name on a neutral tile.
export const SiteIcon = (props: SiteIconProps): JSX.Element => {
  const size = props.size ?? 18
  const [failed, setFailed] = useState(false)
  const letter = (props.name ?? '').trim().charAt(0).toLocaleUpperCase()
  return (
    <Tile
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(3, Math.round(size / 4.5)),
        fontSize: Math.round(size * 0.55),
      }}
    >
      {props.src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.src} alt="" onError={() => setFailed(true)} />
      ) : (
        letter
      )}
    </Tile>
  )
}
