import { DotsThree, MagnifyingGlass } from '@phosphor-icons/react'
import { useKBar } from 'kbar'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { motion, reducedMotion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import type { NavigationSection } from '../NavigationLayout'
import { useEditionStatus } from '../../../lib/edition/useEdition'

export const MOBILE_TOP_BAR_HEIGHT = 48

// The iPhone's main navigation sits at the top. Safari keeps its own
// toolbar at the bottom of the screen, so a bar there would stack on it.
const Bar = styled('nav', {
  display: 'none',
  '@mdDown': { display: 'flex' },
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 8,
  alignItems: 'center',
  gap: '4px',
  height: `calc(${MOBILE_TOP_BAR_HEIGHT}px + env(safe-area-inset-top, 0px))`,
  padding:
    'env(safe-area-inset-top, 0px) calc(8px + env(safe-area-inset-right, 0px)) 0 calc(16px + env(safe-area-inset-left, 0px))',
  boxSizing: 'border-box',
  background: 'color-mix(in srgb, $colors$stCanvas 86%, transparent)',
  backdropFilter: 'saturate(1.6) blur(16px)',
  WebkitBackdropFilter: 'saturate(1.6) blur(16px)',
  borderBottom: '1px solid $stLine',
  fontFamily: '$inter',
  transition: `transform ${motion.slow}`,
  // Slides away while scrolling down and returns on the way back up.
  '&[data-hidden="true"]': { transform: 'translateY(-100%)' },
  [reducedMotion]: { transition: 'none' },
  '@media print': { display: 'none' },
})

const Tabs = styled('div', {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'stretch',
  gap: '18px',
  height: '100%',
  overflowX: 'auto',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
})

const Tab = styled(Link, {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  flex: 'none',
  fontSize: '15px',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  color: '$stMuted',
  textDecoration: 'none',
  WebkitTapHighlightColor: 'transparent',
  transition: `color ${motion.fast}`,
  '&[aria-current="page"]': { color: '$stInk', fontWeight: 600 },
  '&[aria-current="page"]::after': {
    content: '""',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '-1px',
    height: '2px',
    background: '$stAccent',
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

const More = styled('button', {
  all: 'unset',
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  width: '40px',
  height: '40px',
  borderRadius: '$sm',
  color: '$stInk2',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  '&:active': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-2px' },
})

const Fresh = styled('span', {
  width: '6px',
  height: '6px',
  marginLeft: '5px',
  borderRadius: '50%',
  background: '$stAccent',
})

type TabItem = { section: NavigationSection; label: string; href: string }

const HOME: TabItem = { section: 'home', label: 'Home', href: '/l/home' }
const EDITION: TabItem = {
  section: 'edition',
  label: 'Edition',
  href: '/l/edition',
}
const LIBRARY: TabItem = {
  section: 'library',
  label: 'Library',
  href: '/l/library',
}
const FEEDS: TabItem = {
  section: 'subscriptions',
  label: 'Feeds',
  href: '/l/subscriptions',
}
const HIGHLIGHTS: TabItem = {
  section: 'highlights',
  label: 'Highlights',
  href: '/l/highlights',
}

// While The Edition is out it takes Highlights' place, which stays in More.
const tabsFor = (editionOut: boolean): TabItem[] =>
  editionOut
    ? [HOME, EDITION, LIBRARY, FEEDS]
    : [HOME, LIBRARY, FEEDS, HIGHLIGHTS]

export function MobileTopBar(props: {
  section: NavigationSection
  onMore: () => void
}): JSX.Element {
  const { query } = useKBar()
  const edition = useEditionStatus()
  const tabs = tabsFor(edition.out || props.section == 'edition')
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  // Pages leave room at the top for the bar (see globalStyles).
  useEffect(() => {
    document.body.dataset.topbar = 'on'
    return () => {
      delete document.body.dataset.topbar
    }
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const delta = y - lastY.current
      if (y < MOBILE_TOP_BAR_HEIGHT) setHidden(false)
      else if (delta > 6) setHidden(true)
      else if (delta < -6) setHidden(false)
      if (Math.abs(delta) > 6) lastY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <Bar aria-label="Main" data-hidden={hidden}>
      <Tabs>
        {tabs.map((item) => (
          <Tab
            key={item.section}
            href={item.href}
            data-nav={item.section}
            aria-current={
              props.section == item.section ||
              (props.section == 'discover' && item.section == 'subscriptions')
                ? 'page'
                : undefined
            }
          >
            {item.label}
            {item.section == 'edition' && edition.fresh && <Fresh />}
          </Tab>
        ))}
      </Tabs>
      <More type="button" onClick={() => query.toggle()} aria-label="Search">
        <MagnifyingGlass size={20} />
      </More>
      <More type="button" onClick={props.onMore} aria-label="More">
        <DotsThree size={22} weight="bold" />
      </More>
    </Bar>
  )
}
