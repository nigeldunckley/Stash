import { styled } from '../../tokens/stitches.config'
import { motion } from './motion'

const Group = styled('div', {
  display: 'inline-flex',
  gap: '2px',
  padding: '2px',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '7px',
})

const Option = styled('button', {
  all: 'unset',
  cursor: 'pointer',
  fontFamily: '$inter',
  fontSize: '$caption',
  lineHeight: '18px',
  padding: '2px 10px',
  borderRadius: '5px',
  color: '$stMuted',
  transition: `color ${motion.fast}, background ${motion.fast}`,
  '&:hover': { color: '$stInk' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
  '&[aria-checked="true"]': {
    color: '$stInk',
    background: '$stSunken',
    fontWeight: 500,
  },
})

export type SegmentedOption<T extends string> = {
  value: T
  label: string
}

type SegmentedControlProps<T extends string> = {
  label: string
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>
): JSX.Element {
  return (
    <Group role="radiogroup" aria-label={props.label}>
      {props.options.map((option) => (
        <Option
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === props.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </Option>
      ))}
    </Group>
  )
}
