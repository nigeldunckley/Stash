// Shared easing and durations for the Stash screens.
// `spring` is the curve iOS uses for sheets: it starts quickly and takes its
// time to settle, so things feel placed rather than slid.
export const ease = 'cubic-bezier(0.2, 0, 0, 1)'
export const spring = 'cubic-bezier(0.32, 0.72, 0, 1)'

export const motion = {
  // Hover, press and colour changes.
  fast: `150ms ${ease}`,
  // Popovers, menus, toasts and small moves.
  base: `240ms ${spring}`,
  // Bars and panes that move a long way.
  slow: `360ms ${spring}`,
  // Sheets, the ⌘K panel and the Feeds peek pane.
  sheet: `480ms ${spring}`,
}

export const reducedMotion = '@media (prefers-reduced-motion: reduce)'

// Buttons sink a little while pressed, as controls do on iPhone and Mac.
export const pressable = {
  '&:active:not(:disabled)': { transform: 'scale(0.97)' },
  [reducedMotion]: { '&:active:not(:disabled)': { transform: 'none' } },
}
