import { config } from '../../tokens/stitches.config'
import Image from 'next/image'
import { StyledText } from '../../elements/StyledText'
import { OmnivoreLogoBase } from './OmnivoreLogoBase'

export function OmnivoreNameLogoImage(): JSX.Element {
  return (
    <Image
      src="/static/icons/logo-landing.svg"
      alt="Stash"
      width={136}
      height={27}
    />
  )
}

type OmnivoreLogoProps = {
  size: number
  strokeColor: string
}

export const STASH_ORANGE = '#FF4F00'

// The Stash mark: a bookmark on an International Orange tile. strokeColor
// is kept for API compatibility; the mark always uses its own colours.
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
      <rect width="24" height="24" rx="7" fill={STASH_ORANGE} />
      <path d="M8 6.5h8v11.5l-4-2.7-4 2.7z" fill="#09090B" />
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
  const fillColor = props.color || config.theme.colors.graySolid

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
