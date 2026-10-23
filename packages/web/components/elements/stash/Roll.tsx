import { useEffect, useRef, useState } from 'react'
import { keyframes, styled } from '../../tokens/stitches.config'
import { reducedMotion, spring } from './motion'

const rollUp = keyframes({
  from: { transform: 'translateY(0)' },
  to: { transform: 'translateY(-50%)' },
})

const settle = keyframes({
  '0%, 70%': { color: '$stAccentText' },
  '100%': { color: '$stMuted' },
})

// A count that goes up rolls like an odometer and stays orange for a beat.
export const Roll = styled('span', {
  display: 'inline-flex',
  flexDirection: 'column',
  height: '1.3em',
  lineHeight: '1.3em',
  overflow: 'hidden',
  verticalAlign: 'bottom',
  animation: `${settle} 1600ms ease forwards`,
  '& > span': {
    animation: `${rollUp} 240ms ${spring} forwards`,
  },
  '& > span:first-child': { opacity: 0.35 },
  [reducedMotion]: { '& > span': { animation: 'none' } },
})

// Remembers the last count, so a rise can be shown as a roll.
export function useRoll(count: number | undefined): {
  from?: number
  key: number
} {
  const previous = useRef(count)
  const [rolled, setRolled] = useState<{ from?: number; key: number }>({
    key: 0,
  })
  useEffect(() => {
    const before = previous.current
    previous.current = count
    if (before !== undefined && count !== undefined && count > before) {
      setRolled((current) => ({ from: before, key: current.key + 1 }))
      const timer = setTimeout(
        () => setRolled((current) => ({ key: current.key })),
        1600
      )
      return () => clearTimeout(timer)
    }
  }, [count])
  return rolled
}
