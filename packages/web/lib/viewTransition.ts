import type { NextRouter } from 'next/router'

// Opens an item with a View Transition: the item's title grows into the
// Reader's headline while the rest of the page crossfades. Browsers without
// View Transitions (or with reduced motion) simply navigate.

const MORPH_NAME = 'reader-headline'
const HEADLINE = '[data-testid="article-headline"]'

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void>) => {
    finished: Promise<void>
  }
}

const waitFor = (selector: string, timeout: number) =>
  new Promise<Element | null>((resolve) => {
    const started = performance.now()
    const look = () => {
      const found = document.querySelector(selector)
      if (found || performance.now() - started > timeout) resolve(found)
      else requestAnimationFrame(look)
    }
    look()
  })

export function navigateWithMorph(
  router: NextRouter,
  path: string,
  itemId?: string
): void {
  const doc = document as ViewTransitionDocument
  if (
    !doc.startViewTransition ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    router.push(path)
    return
  }

  const source = itemId
    ? document.querySelector<HTMLElement>(
        `[data-morph-title="${CSS.escape(itemId)}"]`
      )
    : null
  if (source) source.style.setProperty('view-transition-name', MORPH_NAME)

  let landed: HTMLElement | undefined
  const transition = doc.startViewTransition(async () => {
    if (source) source.style.removeProperty('view-transition-name')
    await router.push(path)
    // The Reader fetches the article after the route changes; give the
    // headline a moment to appear so the title has somewhere to land.
    const headline = await waitFor(HEADLINE, source ? 400 : 0)
    if (headline instanceof HTMLElement) {
      landed = headline
      headline.style.setProperty('view-transition-name', MORPH_NAME)
    }
  })
  transition.finished
    .catch(() => undefined)
    .finally(() => landed?.style.removeProperty('view-transition-name'))
}
