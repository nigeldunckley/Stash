import {
  Archive,
  CaretLeft,
  DotsThree,
  Notebook,
  Tag,
  TextAa,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { State } from '../../../lib/networking/fragments/articleFragment'
import { ReaderSettings } from '../../../lib/hooks/useReaderSettings'
import { useMediaQuery } from '../../../lib/hooks/useMediaQuery'
import { formatMinutes, minutesLeft } from '../../../lib/readingTime'
import { siteName } from '../../../lib/textFormatting'
import { setThemeColorToken } from '../../../lib/themeUpdater'
import {
  Dropdown,
  DropdownOption,
  DropdownSeparator,
} from '../../elements/DropdownElements'
import { IconButton, Popover, SiteIcon } from '../../elements/stash'
import { glassFilter } from '../../elements/stash/material'
import { motion, reducedMotion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'
import { ReaderTextSettings } from './ReaderTextSettings'

export const READER_BAR_HEIGHT = 52

// Reading progress, drawn along the bar's bottom edge. When the bar slides
// away the line is left showing at the very top of the screen.
const Progress = styled('div', {
  position: 'absolute',
  left: 0,
  bottom: '-2px',
  height: '2px',
  width: '100%',
  transformOrigin: 'left',
  background: '$stAccent',
  transition: `transform ${motion.fast}`,
  pointerEvents: 'none',
  [reducedMotion]: { transition: 'none' },
})

// The headline, settling into the middle of the bar once the article's own
// headline has scrolled out of view.
const BarTitle = styled('div', {
  position: 'absolute',
  left: '50%',
  bottom: 0,
  height: `${READER_BAR_HEIGHT}px`,
  display: 'flex',
  alignItems: 'center',
  maxWidth: 'min(52%, 560px)',
  transform: 'translate(-50%, 6px)',
  opacity: 0,
  fontSize: '$small',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: '$stInk',
  pointerEvents: 'none',
  transition: `opacity ${motion.base}, transform ${motion.base}`,
  [reducedMotion]: { transition: `opacity ${motion.fast}` },
  span: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '@smDown': { maxWidth: 'calc(100% - 200px)' },
  variants: {
    shown: {
      true: { opacity: 1, transform: 'translate(-50%, 0)' },
    },
  },
})

const Bar = styled('header', {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 5,
  boxSizing: 'border-box',
  height: `calc(${READER_BAR_HEIGHT}px + env(safe-area-inset-top, 0px))`,
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))',
  paddingRight: 'max(12px, env(safe-area-inset-right, 0px))',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  // Frosted over the article, in the reader's own paper colour.
  background: 'color-mix(in srgb, $colors$readerBg 78%, transparent)',
  backdropFilter: glassFilter,
  WebkitBackdropFilter: glassFilter,
  borderBottom: '1px solid transparent',
  fontFamily: '$inter',
  transition: `transform ${motion.slow}, border-color ${motion.base}`,
  // Hidden, the bar keeps its progress line on screen.
  [reducedMotion]: { transition: 'none' },
  '@media print': { display: 'none' },
  'body[data-notebook="open"] &': {
    '@media (min-width: 1100px)': { right: '360px' },
  },
  variants: {
    hidden: {
      true: { transform: 'translateY(-100%)' },
    },
    scrolled: {
      true: { borderBottomColor: '$stLine' },
    },
  },
})

const Source = styled('a', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  fontSize: '$small',
  color: '$stMuted',
  textDecoration: 'none',
  transition: `opacity ${motion.base}`,
  span: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '@media (hover: hover)': { '&:hover': { color: '$stInk' } },
  variants: {
    // Steps back while the headline sits in the middle of the bar.
    receded: {
      true: { opacity: 0, pointerEvents: 'none' },
    },
  },
})

const TimeLeft = styled('span', {
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  marginRight: '6px',
  fontVariantNumeric: 'tabular-nums',
  '@smDown': { display: 'none' },
})

const MenuGlyph = styled('span', {
  display: 'grid',
  placeItems: 'center',
  width: '30px',
  height: '30px',
  borderRadius: '$sm',
  border: '1px solid transparent',
  color: '$stMuted',
  '@media (hover: hover)': {
    '&:hover': {
      color: '$stInk',
      background: '$stSurface',
      borderColor: '$stLine',
    },
  },
})

type ReaderBarItem = {
  title: string
  url: string
  originalArticleUrl: string
  siteName?: string
  siteIcon?: string
  wordsCount?: number
  state?: State
}

type StashReaderBarProps = {
  item?: ReaderBarItem
  autoHide: boolean
  readerSettings: ReaderSettings
  actionHandler: (action: string, arg?: unknown) => void
  onBack: () => void
  onToggleNotebook: () => void
  notebookOpen: boolean
}

const scrollPercent = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight
  return max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0
}

// The reader's single top bar: back, source, time left and the reading tools.
// It slides away while scrolling down and returns on scroll up or a tap.
export function StashReaderBar(props: StashReaderBarProps): JSX.Element {
  const [percent, setPercent] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [titleInBar, setTitleInBar] = useState(false)
  const phone = useMediaQuery('(max-width: 575px)')

  // Safari's toolbar takes the reader's paper colour while reading.
  useEffect(() => {
    setThemeColorToken('readerBg')
    return () => setThemeColorToken('stCanvas')
  }, [])

  // Watch the article's headline; once it scrolls up under the bar, the
  // bar shows it instead.
  const title = props.item?.title
  useEffect(() => {
    let observer: IntersectionObserver | undefined
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const watch = () => {
      const headline = document.querySelector(
        '[data-testid="article-headline"]'
      )
      if (!headline) {
        if (tries++ < 20) timer = setTimeout(watch, 250)
        return
      }
      observer = new IntersectionObserver(
        ([entry]) =>
          setTitleInBar(
            !entry.isIntersecting && entry.boundingClientRect.top < 0
          ),
        { rootMargin: `-${READER_BAR_HEIGHT}px 0px 0px 0px` }
      )
      observer.observe(headline)
    }
    watch()
    return () => {
      clearTimeout(timer)
      observer?.disconnect()
    }
  }, [title])

  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const next = scrollPercent()
      setPercent(next)
      if (!props.autoHide || y < 80 || next > 98) {
        setHidden(false)
      } else if (y - lastY > 8) {
        setHidden(true)
      } else if (lastY - y > 8) {
        setHidden(false)
      }
      lastY = y
    }
    const onTap = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (
        target.closest('a, button, input, [role="dialog"], .highlight') ||
        !window.getSelection()?.isCollapsed
      ) {
        return
      }
      setHidden(false)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('click', onTap)
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('click', onTap)
    }
  }, [props.autoHide])

  const item = props.item
  const source = item
    ? siteName(item.originalArticleUrl, item.url, item.siteName)
    : ''
  const left = formatMinutes(minutesLeft(item?.wordsCount, percent))
  const keepVisible = settingsOpen || menuOpen

  return (
    <>
      <Bar hidden={hidden && !keepVisible} scrolled={percent > 0}>
        <Progress
          aria-hidden="true"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
        <IconButton label="Back" shortcut="u" onClick={props.onBack}>
          <CaretLeft size={18} />
        </IconButton>
        {item && (
          <Source
            receded={titleInBar || phone}
            aria-hidden={phone || undefined}
            tabIndex={phone ? -1 : undefined}
            href={item.originalArticleUrl || item.url}
            target="_blank"
            rel="noreferrer"
            title="Open original"
          >
            <SiteIcon src={item.siteIcon} name={source} />
            <span>{source}</span>
          </Source>
        )}
        {item && (
          <BarTitle shown={titleInBar} aria-hidden={!titleInBar}>
            <span>{item.title}</span>
          </BarTitle>
        )}
        <span style={{ flex: 1 }} />
        {left && left !== 'Read' && <TimeLeft>{left} left</TimeLeft>}
        {!phone && (
          <>
            <IconButton
              label={item?.state === State.ARCHIVED ? 'Unarchive' : 'Archive'}
              shortcut="e"
              onClick={() =>
                props.actionHandler(
                  item?.state === State.ARCHIVED ? 'unarchive' : 'archive'
                )
              }
            >
              <Archive size={18} />
            </IconButton>
            <IconButton
              label="Labels"
              shortcut="l"
              onClick={() => props.readerSettings.setShowSetLabelsModal(true)}
            >
              <Tag size={18} />
            </IconButton>
          </>
        )}
        <Popover
          label="Text settings"
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          trigger={
            <IconButton label="Text settings" active={settingsOpen}>
              <TextAa size={18} />
            </IconButton>
          }
        >
          <ReaderTextSettings
            readerSettings={props.readerSettings}
            onShowAllSettings={() => {
              setSettingsOpen(false)
              props.readerSettings.setShowEditDisplaySettingsModal(true)
            }}
          />
        </Popover>
        {!phone && (
          <IconButton
            label="Highlights and notes"
            shortcut="t"
            active={props.notebookOpen}
            onClick={props.onToggleNotebook}
          >
            <Notebook size={18} />
          </IconButton>
        )}
        <Dropdown
          align="end"
          sideOffset={6}
          onOpenChange={setMenuOpen}
          triggerElement={
            <MenuGlyph aria-label="More actions" title="More actions">
              <DotsThree size={18} weight="bold" />
            </MenuGlyph>
          }
        >
          {phone && (
            <>
              <DropdownOption
                onSelect={() =>
                  props.actionHandler(
                    item?.state === State.ARCHIVED ? 'unarchive' : 'archive'
                  )
                }
                title={item?.state === State.ARCHIVED ? 'Unarchive' : 'Archive'}
              />
              <DropdownOption
                onSelect={() =>
                  props.readerSettings.setShowSetLabelsModal(true)
                }
                title="Labels…"
              />
              <DropdownOption
                onSelect={props.onToggleNotebook}
                title="Highlights and notes"
              />
              <DropdownSeparator />
            </>
          )}
          <DropdownOption
            onSelect={() => props.actionHandler('openOriginalArticle')}
            title={source ? `Open on ${source}` : 'Open original'}
          />
          <DropdownOption
            onSelect={() => props.actionHandler('showEditModal')}
            title="Edit info"
          />
          <DropdownOption
            onSelect={() => props.actionHandler('mark-read')}
            title="Mark as read"
          />
          <DropdownOption
            onSelect={() => props.actionHandler('mark-unread')}
            title="Mark as unread"
          />
          <DropdownSeparator />
          <DropdownOption
            onSelect={() => props.actionHandler('delete')}
            title="Delete"
            destructive
          />
        </Dropdown>
      </Bar>
    </>
  )
}
