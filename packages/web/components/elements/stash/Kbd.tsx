import { styled } from '../../tokens/stitches.config'

export const Kbd = styled('kbd', {
  fontFamily: '$mono',
  fontSize: '$micro',
  lineHeight: '16px',
  minWidth: '18px',
  height: '18px',
  px: '4px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '$stMuted',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '4px',
})
