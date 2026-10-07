import { config } from '../../tokens/stitches.config'
import { OmnivoreLogoBase } from './OmnivoreLogoBase'
import { StashMark } from './OmnivoreNameLogo'
import { StyledText } from '../StyledText'

export type OmnivoreFullLogoProps = {
  color?: string
  href?: string
  showTitle?: boolean
}

export function OmnivoreFullLogo(props: OmnivoreFullLogoProps): JSX.Element {
  const fillColor = props.color || config.theme.colors.graySolid

  return (
    <OmnivoreLogoBase {...props}>
      <StashMark size={26} />
      {props.showTitle !== false && (
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
