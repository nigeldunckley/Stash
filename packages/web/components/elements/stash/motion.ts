// Shared easing and durations for the Stash screens. Keep movement short and quiet.
export const ease = 'cubic-bezier(0.2, 0, 0, 1)'

export const motion = {
  fast: `120ms ${ease}`,
  base: `200ms ${ease}`,
  slow: `280ms ${ease}`,
}

export const reducedMotion = '@media (prefers-reduced-motion: reduce)'
