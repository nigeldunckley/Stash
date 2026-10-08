import { theme } from '../../tokens/stitches.config'
import { StyledText } from '../../elements/StyledText'
import { OmnivoreLogoBase } from './OmnivoreLogoBase'
import {
  STASH_ORANGE,
  STASH_INK,
  STASH_RIBBON,
  STASH_BOOKMARK,
} from './StashBrand'

export { STASH_ORANGE } from './StashBrand'

export function OmnivoreNameLogoImage(): JSX.Element {
  return <OmnivoreNameLogo showTitle />
}

type OmnivoreLogoProps = {
  size: number
  strokeColor: string
}

// The folded S and bookmark on Stash's International Orange tile.
export function StashMark(props: { size: number }): JSX.Element {
  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="24" height="24" rx="5.5" fill={STASH_ORANGE} />
      <path d={STASH_RIBBON} fill={STASH_INK} />
      <path d={STASH_BOOKMARK} fill={STASH_INK} />
    </svg>
  )
}

export function OmnivoreSmallLogo(props: OmnivoreLogoProps): JSX.Element {
  return <StashMark size={20} />
}

export function OmnivoreLogoIcon(props: OmnivoreLogoProps): JSX.Element {
  return <StashMark size={props.size} />
}

export type OmnivoreNameLogoProps = {
  color?: string
  href?: string
  showTitle?: boolean
}

export function OmnivoreNameLogo(props: OmnivoreNameLogoProps): JSX.Element {
  const fillColor = props.color || theme.colors.thTextContrast.toString()

  return (
    <OmnivoreLogoBase {...props}>
      <StashMark size={26} />
      {props.showTitle && (
        <StyledText
          style="logoTitle"
          css={{ color: fillColor, paddingLeft: '10px' }}
        >
          Stash
        </StyledText>
      )}
    </OmnivoreLogoBase>
  )
}
