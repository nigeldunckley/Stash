import { CSSProperties } from 'react'

// The swallowtail from the foot of the S in Stash's mark, used on its own:
// it marks your place in the Reader and on part-read rows, and is the Saved
// icon in the sidebar.

// A hanging ribbon, drawn in a 14 × 40 box and stretched to any size.
export const Ribbon = (props: {
  width: number
  height: number
  className?: string
  style?: CSSProperties
}): JSX.Element => (
  <svg
    width={props.width}
    height={props.height}
    viewBox="0 0 14 40"
    preserveAspectRatio="none"
    aria-hidden="true"
    className={props.className}
    style={{ display: 'block', flex: 'none', ...props.style }}
  >
    <path d="M0 0h14v40l-7-6-7 6z" fill="var(--colors-stAccent)" />
  </svg>
)

// The same shape as an icon, sized to sit with the sidebar's Phosphor icons.
export const RibbonIcon = (props: {
  size?: number
  className?: string
}): JSX.Element => {
  const size = props.size ?? 18
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={props.className}
      style={{ display: 'block', flex: 'none' }}
    >
      <path d="M5 1.5h6v13l-3-2.6-3 2.6z" fill="currentColor" />
    </svg>
  )
}
