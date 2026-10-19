import type { NextRouter } from 'next/router'

// The Unfold. Opening an item is one continuous move: its picture grows into
// the Reader's header image, its title grows into the headline, and the list
// sinks away underneath. Going back folds the article into its row again.
// Browsers without View Transitions (or with reduced motion) simply navigate.

const MORPH_NAME = 'reader-headline'
const HERO_NAME = 'reader-hero'
const HEADLINE = '[data-testid="article-headline"]'
const HERO = '[data-unfold-hero]'

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void>) => {
    finished: Promise<void>
  }
}

type Named = [Element | null, string]

// The last item opened this way, so going back can fold into its row.
let last: { itemId?: string; from: string; to: string } | undefined

const canAnimate = (): boolean =>
  !!(document as ViewTransitionDocument).startViewTransition &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

const onScreen = (element: Element | null): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false
  const rect = element.getBoundingClientRect()
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight
  )
}

const titleFor = (itemId?: string): HTMLElement | null =>
  itemId
    ? document.querySelector<HTMLElement>(
        `[data-morph-title="${CSS.escape(itemId)}"]`
      )
    : null

// The picture that belongs with a title: in its row, or in the card around it.
const pictureFor = (title: Element | null): HTMLElement | null => {
  if (!title) return null
  const card =
    title.closest('[data-stash-row], [data-story]') ??
    title.parentElement?.parentElement
  // The largest picture, so a row's site icon is never taken for its
  // thumbnail.
  let picture: HTMLImageElement | null = null
  let area = 0
  card?.querySelectorAll('img').forEach((image) => {
    const box = image.getBoundingClientRect()
    if (box.width * box.height > area) {
      picture = image
      area = box.width * box.height
    }
  })
  return area >= 32 * 32 && onScreen(picture) ? picture : null
}

const name = ([element, value]: Named) => {
  if (element instanceof HTMLElement) {
    element.style.setProperty('view-transition-name', value)
  }
}

const unname = ([element]: Named) => {
  if (element instanceof HTMLElement) {
    element.style.removeProperty('view-transition-name')
  }
}

const run = (
  direction: 'open' | 'close',
  from: Named[],
  update: () => Promise<Named[]>
) => {
  const doc = document as ViewTransitionDocument
  const root = document.documentElement
  root.dataset.unfold = direction
  from.forEach(name)
  let landed: Named[] = []
  const transition = doc.startViewTransition?.(async () => {
    from.forEach(unname)
    landed = await update()
    landed.forEach(name)
  })
  if (!transition) return
  transition.finished
    .catch(() => undefined)
    .finally(() => {
      landed.forEach(unname)
      delete root.dataset.unfold
    })
}

export function navigateWithMorph(
  router: NextRouter,
  path: string,
  itemId?: string
): void {
  if (!canAnimate()) {
    router.push(path)
    return
  }
  const title = titleFor(itemId)
  const picture = pictureFor(title)
  last = { itemId, from: router.asPath, to: path }
  run(
    'open',
    [
      [title, MORPH_NAME],
      [picture, HERO_NAME],
    ],
    async () => {
      await router.push(path)
      // The Reader fetches the article after the route changes; give the
      // headline a moment to appear so the title has somewhere to land.
      const headline = await waitFor(HEADLINE, title ? 400 : 0)
      const hero = picture ? await waitFor(HERO, 120) : null
      return [
        [headline, MORPH_NAME],
        [hero, HERO_NAME],
      ]
    }
  )
}

const samePath = (a: string, b: string) => a.split('#')[0] == b.split('#')[0]

// Leaves the Reader for `path`, folding the article back into the row it
// came from when that row is on the page we're returning to.
const fold = (path: string, go: () => Promise<unknown>): void => {
  const opened = last
  last = undefined
  if (!opened || !canAnimate() || !samePath(path, opened.from)) {
    void go()
    return
  }
  const hero = document.querySelector(HERO)
  run(
    'close',
    [
      [document.querySelector(HEADLINE), MORPH_NAME],
      [onScreen(hero) ? hero : null, HERO_NAME],
    ],
    async () => {
      await go()
      const title = opened.itemId
        ? await waitFor(
            `[data-morph-title="${CSS.escape(opened.itemId)}"]`,
            300
          )
        : null
      return [
        [onScreen(title) ? title : null, MORPH_NAME],
        [pictureFor(title), HERO_NAME],
      ]
    }
  )
}

export function foldBackTo(
  router: NextRouter,
  path: string,
  options?: { scroll?: boolean }
): void {
  fold(path, () => router.push(path, undefined, options))
}

let installed = false

// The browser's Back button folds too, except where the browser draws its
// own transition (Safari's edge swipe), which would otherwise play twice.
export function installFoldOnBack(
  router: Pick<NextRouter, 'asPath' | 'beforePopState' | 'replace'>
): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  let browserAnimated = false
  window.addEventListener(
    'popstate',
    (event) => {
      browserAnimated = !!(
        event as PopStateEvent & {
          hasUAVisualTransition?: boolean
        }
      ).hasUAVisualTransition
    },
    { capture: true }
  )
  router.beforePopState(({ url, as, options }) => {
    if (
      browserAnimated ||
      !last ||
      !samePath(as, last.from) ||
      !samePath(router.asPath, last.to)
    ) {
      return true
    }
    fold(as, () => router.replace(url, as, options))
    return false
  })
}
