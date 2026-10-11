// The frosted surface for anything that floats over content: bars, menus,
// popovers, the ⌘K panel and toasts. Content scrolling underneath stays
// faintly visible, as it does under Safari's own toolbar.
export const glassFilter = 'blur(24px) saturate(180%)'

export const glass = {
  background: '$stMaterial',
  backdropFilter: glassFilter,
  WebkitBackdropFilter: glassFilter,
  // Without blur support the panel would be see-through, so fall back to
  // the solid surface.
  '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))':
    { background: '$stSurface' },
}

// The same, for panels that hold a lot of text and need more contrast.
export const glassStrong = {
  ...glass,
  background: '$stMaterialStrong',
}

// A shadow for floating panels: a tight contact shadow and a soft drop.
export const floatingShadow =
  '0 1px 2px rgba(9, 9, 11, 0.06), 0 16px 40px -12px rgba(9, 9, 11, 0.28)'

// The edge of a floating panel: a true hairline on Retina screens, as macOS
// draws menus and popovers.
export const hairlineEdge = {
  border: '1px solid $stLine',
  '@media (min-resolution: 2dppx)': { border: '0.5px solid $stLineStrong' },
}
