import {
  Books,
  DotsThreeOutline,
  Highlighter,
  House,
  Rss,
} from '@phosphor-icons/react'
import Link from 'next/link'
import { ReactNode, useEffect } from 'react'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import type { NavigationSection } from '../NavigationLayout'

export const MOBILE_TAB_BAR_HEIGHT = 56

const Bar = styled('nav', {
  display: 'none',
  '@mdDown': { display: 'grid' },
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 8,
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  height: `calc(${MOBILE_TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  paddingLeft: 'env(safe-area-inset-left, 0px)',
  paddingRight: 'env(safe-area-inset-right, 0px)',
  boxSizing: 'border-box',
  background: 'color-mix(in srgb, $colors$stCanvas 88%, transparent)',
  backdropFilter: 'saturate(1.6) blur(16px)',
  WebkitBackdropFilter: 'saturate(1.6) blur(16px)',
  borderTop: '1px solid $stLine',
  fontFamily: '$inter',
  '@media print': { display: 'none' },
})

const tab = {
  all: 'unset',
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: '3px',
  fontSize: '10.5px',
  fontWeight: 500,
  color: '$stMuted',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  transition: `color ${motion.fast}`,
  '&[aria-current="page"]': { color: '$stInk' },
  '&[aria-current="page"] svg': { color: '$stAccent' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '-4px' },
}

const TabLink = styled(Link, tab)
const TabButton = styled('button', tab)

type Tab = {
  section: NavigationSection
  label: string
  href: string
  icon: ReactNode
}

const TABS: Tab[] = [
  {
    section: 'home',
    label: 'Home',
    href: '/l/home',
    icon: <House size={22} />,
  },
  {
    section: 'library',
    label: 'Library',
    href: '/l/library',
    icon: <Books size={22} />,
  },
  {
    section: 'subscriptions',
    label: 'Feeds',
    href: '/l/subscriptions',
    icon: <Rss size={22} />,
  },
  {
    section: 'highlights',
    label: 'Highlights',
    href: '/l/highlights',
    icon: <Highlighter size={22} />,
  },
]

// The iPhone's main navigation: the four main places, and More for the
// full menu (Archive, Trash, shortcuts, settings).
export function MobileTabBar(props: {
  section: NavigationSection
  onMore: () => void
}): JSX.Element {
  // Pages leave room at the bottom for the bar (see globalStyles).
  useEffect(() => {
    document.body.dataset.tabbar = 'on'
    return () => {
      delete document.body.dataset.tabbar
    }
  }, [])

  return (
    <Bar aria-label="Main">
      {TABS.map((item) => (
        <TabLink
          key={item.section}
          href={item.href}
          aria-current={props.section == item.section ? 'page' : undefined}
        >
          {item.icon}
          {item.label}
        </TabLink>
      ))}
      <TabButton onClick={props.onMore} aria-label="More">
        <DotsThreeOutline size={22} />
        More
      </TabButton>
    </Bar>
  )
}
