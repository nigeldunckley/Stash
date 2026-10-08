import { styled } from '../../tokens/stitches.config'
import { motion } from './motion'

const clamp = (value: number) => Math.min(100, Math.max(0, value))

const Track = styled('div', {
  height: '2px',
  borderRadius: '2px',
  background: '$stLine',
  overflow: 'hidden',
})

const Fill = styled('div', {
  height: '100%',
  background: '$stAccent',
  transition: `width ${motion.base}`,
})

// A thin progress line, used on cards and at the top of the reader.
export const ProgressLine = (props: {
  percent: number
  label?: string
}): JSX.Element => {
  const percent = clamp(props.percent)
  return (
    <Track
      role="progressbar"
      aria-label={props.label ?? 'Reading progress'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <Fill style={{ width: `${percent}%` }} />
    </Track>
  )
}

// A small ring for list rows. Empty when unread, full when finished.
export const ProgressRing = (props: {
  percent: number
  size?: number
}): JSX.Element => {
  const size = props.size ?? 14
  const stroke = 1.75
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const percent = clamp(props.percent)
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${Math.round(percent)}% read`}
      style={{ flex: 'none', transform: 'rotate(-90deg)' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--colors-stLineStrong)"
        strokeWidth={stroke}
      />
      {percent > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--colors-stAccent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
        />
      )}
    </svg>
  )
}

// The orange dot that marks unseen feed items.
export const UnseenDot = styled('span', {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  background: '$stAccent',
  flex: 'none',
  variants: {
    hidden: {
      true: { visibility: 'hidden' },
    },
  },
})
