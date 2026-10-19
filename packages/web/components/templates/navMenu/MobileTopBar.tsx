import { DotsThree, MagnifyingGlass } from '@phosphor-icons/react'
import { useKBar } from 'kbar'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { motion, reducedMotion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import type { NavigationSection } from '../NavigationLayout'
import { useEditionStatus } from '../../../lib/edition/useEdition'
import { NavPage, useNavCount, useNavGroups } from './sections'

export const MOBILE_TOP_BAR_HEIGHT = 48
export const MOBILE_SUB_ROW_HEIGHT = 40

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
  flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top, 0px)',
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

const Row = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  height: `${MOBILE_TOP_BAR_HEIGHT}px`,
  padding:
    '0 calc(8px + env(safe-area-inset-right, 0px)) 0 calc(16px + env(safe-area-inset-left, 0px))',
})

// The open section's pages, as a row of pills under the tabs.
const Pages = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: `${MOBILE_SUB_ROW_HEIGHT}px`,
  padding:
    '0 calc(16px + env(safe-area-inset-right, 0px)) 2px calc(16px + env(safe-area-inset-left, 0px))',
  overflowX: 'auto',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
})

const Pill = styled(Link, {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  height: '28px',
  padding: '0 11px',
  borderRadius: '999px',
  border: '1px solid $stLine',
  fontSize: '13px',
  fontWeight: 500,
  color: '$stMuted',
  textDecoration: 'none',
  WebkitTapHighlightColor: 'transparent',
  '&[aria-current="page"]': {
    background: '$stInk',
    borderColor: '$stInk',
    color: '$stCanvas',
  },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

const PillCount = styled('span', {
  fontFamily: '$mono',
  fontSize: '10.5px',
  opacity: 0.7,
  fontVariantNumeric: 'tabular-nums',
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

const Count = styled('sup', {
  marginLeft: '3px',
  fontFamily: '$mono',
  fontSize: '10px',
  fontWeight: 500,
  color: '$stAccentText',
  fontVariantNumeric: 'tabular-nums',
})

// How many new videos wait in Watch.
function NewVideos(): JSX.Element | null {
  const count = useNavCount({
    kind: 'items',
    folder: 'following',
    query: 'type:video -is:seen',
  })
  if (!count) return null
  return <Count aria-label={`${count} new`}>{count > 99 ? '99+' : count}</Count>
}

function PageCount(props: { page: NavPage }): JSX.Element | null {
  const count = useNavCount(props.page.count)
  if (!count) return null
  return (
    <PillCount aria-label={`${count} new`}>
      {count > 99 ? '99+' : count}
    </PillCount>
  )
}

type TabItem = { key: string; label: string; href: string; current: boolean }

export function MobileTopBar(props: {
  section: NavigationSection
  onMore: () => void
}): JSX.Element {
  const { query } = useKBar()
  const edition = useEditionStatus()
  const groups = useNavGroups(props.section)
  const open = groups.find((group) => group.selected)
  // While The Edition is out it sits beside Home.
  const tabs: TabItem[] = [
    {
      key: 'home',
      label: 'Home',
      href: '/l/home',
      current: props.section == 'home',
    },
    ...(edition.out || props.section == 'edition'
      ? [
          {
            key: 'edition',
            label: 'Edition',
            href: '/l/edition',
            current: props.section == 'edition',
          },
        ]
      : []),
    ...groups.map((group) => ({
      key: group.id,
      label: group.label,
      href: group.href,
      current: group.selected,
    })),
  ]
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)

  // Pages leave room at the top for the bar (see globalStyles).
  useEffect(() => {
    document.body.dataset.topbar = 'on'
    return () => {
      delete document.body.dataset.topbar
    }
  }, [])
  // The pill row adds to the room pages leave at the top.
  useEffect(() => {
    if (open) document.body.dataset.subnav = 'on'
    else delete document.body.dataset.subnav
    return () => {
      delete document.body.dataset.subnav
    }
  }, [open])

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
      <Row>
        <Tabs>
          {tabs.map((item) => (
            <Tab
              key={item.key}
              href={item.href}
              data-nav={item.key}
              data-moment-target={`tab-${item.key}`}
              aria-current={item.current ? 'page' : undefined}
            >
              {item.label}
              {item.key == 'edition' && edition.fresh && <Fresh />}
              {item.key == 'watch' && <NewVideos />}
            </Tab>
          ))}
        </Tabs>
        <More type="button" onClick={() => query.toggle()} aria-label="Search">
          <MagnifyingGlass size={20} />
        </More>
        <More
          type="button"
          onClick={props.onMore}
          aria-label="More"
          data-moment-target="more"
        >
          <DotsThree size={22} weight="bold" />
        </More>
      </Row>
      {open && (
        <Pages aria-label={open.label}>
          {/* Watch's collections already have chips on the page itself. */}
          {open.pages
            .filter((page) => !page.color)
            .map((page) => (
              <Pill
                key={page.key}
                href={page.href}
                data-moment-target={
                  page.key == 'saved'
                    ? open.id == 'watch'
                      ? 'watch-saved'
                      : 'saved'
                    : undefined
                }
                aria-current={page.selected ? 'page' : undefined}
              >
                {page.label}
                <PageCount page={page} />
              </Pill>
            ))}
        </Pages>
      )}
    </Bar>
  )
}
