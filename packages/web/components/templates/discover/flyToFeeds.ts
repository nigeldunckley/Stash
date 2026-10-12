// When you follow a suggestion, its icon lifts off the card and drops into
// Feeds: the sidebar entry on Mac, the Feeds tab on iPhone. Nothing moves
// when reduced motion is on.

const visible = (el: Element) => {
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 ? rect : undefined
}

export function flyToFeeds(from: HTMLElement | null | undefined): void {
  if (
    !from ||
    typeof window == 'undefined' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return
  }
  const target = Array.from(
    document.querySelectorAll<HTMLElement>('[data-nav="subscriptions"]')
  ).find((el) => visible(el))
  const start = visible(from)
  const end = target && visible(target)
  if (!start || !end) return

  const ghost = from.cloneNode(true) as HTMLElement
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${start.left}px`,
    top: `${start.top}px`,
    width: `${start.width}px`,
    height: `${start.height}px`,
    margin: '0',
    zIndex: '60',
    pointerEvents: 'none',
    borderRadius: '8px',
    boxShadow: '0 12px 30px -10px rgba(9, 9, 11, 0.35)',
  })
  document.body.appendChild(ghost)

  const dx = end.left + 14 - (start.left + start.width / 2)
  const dy = end.top + end.height / 2 - (start.top + start.height / 2)
  // An arc: up a little first, then down into Feeds.
  const lift = Math.min(-40, dy / 3)
  const animation = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      {
        transform: `translate(${dx * 0.45}px, ${
          dy * 0.25 + lift
        }px) scale(0.9)`,
        opacity: 1,
        offset: 0.4,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(0.3)`,
        opacity: 0.2,
      },
    ],
    { duration: 620, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
  )
  animation.onfinish = () => {
    ghost.remove()
    target?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.06)' },
        { transform: 'scale(1)' },
      ],
      { duration: 280, easing: 'ease-out' }
    )
  }
}
