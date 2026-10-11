import {
  Archive,
  ArrowCounterClockwise,
  Bookmark,
  DotsThree,
  Trash,
} from '@phosphor-icons/react'
import { useRouter } from 'next/router'
import { useCallback, useState } from 'react'
import { State } from '../../../lib/networking/fragments/articleFragment'
import { useRestoreItem } from '../../../lib/networking/library_items/useLibraryItems'
import { formatMinutes, minutesLeft } from '../../../lib/readingTime'
import {
  faviconFor,
  siteName,
  timeAgoInSentence,
} from '../../../lib/textFormatting'
import { sortedLabels } from '../../../lib/labelsSort'
import { Box } from '../../elements/LayoutPrimitives'
import { LoadingBar } from '../../elements/LoadingBar'
import { ProgressBar } from '../../elements/ProgressBar'
import {
  ContextMenu,
  CoverImage,
  IconButton,
  linkEntries,
  MenuEntry,
  SiteIcon,
  SwipeAction,
} from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled, theme } from '../../tokens/stitches.config'
import { CardMenu } from '../CardMenu'
import type { LinkedItemCardAction, LinkedItemCardProps } from './CardTypes'
import { CardCheckbox, FLAIR_ICON_NAMES } from './LibraryCardStyles'

const THUMB = { width: 92, height: 64, phoneWidth: 68, phoneHeight: 52 }

// Actions float over the end of the row on hover, so the row itself stays
// quiet: title, one line of summary and a few details.
const Actions = styled('div', {
  display: 'none',
  position: 'absolute',
  top: '50%',
  right: `${12 + THUMB.width + 16}px`,
  transform: 'translateY(-50%)',
  alignItems: 'center',
  gap: '2px',
  padding: '3px',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '8px',
  boxShadow: '0 6px 16px -10px rgba(9, 9, 11, 0.35)',
})

const Meta = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minWidth: 0,
  marginTop: '6px',
  fontFamily: '$mono',
  fontSize: '11px',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  '& > span': { flex: 'none' },
  '& > span:first-of-type': {
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
})

const Progress = styled('span', {
  display: 'block',
  width: '46px',
  height: '3px',
  borderRadius: '2px',
  background: '$stLine',
  overflow: 'hidden',
  '& > i': {
    display: 'block',
    height: '100%',
    background: '$stAccent',
  },
})

const Thumb = styled(CoverImage, {
  width: `${THUMB.width}px`,
  height: `${THUMB.height}px`,
  borderRadius: '$sm',
  '@smDown': {
    width: `${THUMB.phoneWidth}px`,
    height: `${THUMB.phoneHeight}px`,
  },
})

// Stands in for a missing image: the publication's icon over its name, set
// like a masthead in the reading face, so rows without pictures still look
// finished.
const PublicationTile = styled('span', {
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: '6px',
  width: '100%',
  height: '100%',
  padding: '8px',
  boxSizing: 'border-box',
  fontFamily: '$serif',
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: 1.15,
  letterSpacing: '-0.005em',
  color: '$stInk2',
  textAlign: 'center',
  '& > span:last-child': {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    overflowWrap: 'anywhere',
  },
  '@smDown': { fontSize: '12px', gap: '4px', padding: '6px' },
})

const Row = styled('div', {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '18px',
  width: '100%',
  padding: '14px 12px',
  boxSizing: 'border-box',
  cursor: 'pointer',
  color: '$stInk',
  fontFamily: '$inter',
  transition: `background ${motion.fast}`,
  '&[data-selecting="true"]': {
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    gap: '14px',
  },
  '@smDown': { gap: '14px', padding: '12px 16px' },
  '@media (hover: hover)': {
    '&:hover': { background: '$stSunken' },
    [`&:hover ${Actions}`]: { display: 'flex' },
  },
  // Keyboard users reach the actions by tabbing to the card.
  [`.linkedItemCard:focus-within & ${Actions}`]: { display: 'flex' },
  [`&[data-menu-open="true"] ${Actions}`]: { display: 'flex' },
  // Touch screens use the swipe and the menu instead.
  '@media (hover: none)': { [`& ${Actions}`]: { display: 'none' } },
})

// The dropdown supplies its own trigger button, so this is only the visual.
const MenuGlyph = styled('span', {
  display: 'grid',
  placeItems: 'center',
  width: '26px',
  height: '26px',
  borderRadius: '$sm',
  border: '1px solid transparent',
  color: '$stMuted',
  '&:hover': {
    color: '$stInk',
    background: '$stSunken',
  },
})

const Leading = styled('div', {
  display: 'flex',
  alignItems: 'center',
  input: { margin: 0 },
})

const Body = styled('div', {
  minWidth: 0,
})

const Title = styled('div', {
  fontFamily: '$serif',
  fontSize: '18.5px',
  fontWeight: 500,
  lineHeight: 1.22,
  letterSpacing: '-0.008em',
  color: '$stInk',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  '@smDown': { fontSize: '17px' },
})

const Summary = styled('div', {
  marginTop: '4px',
  fontSize: '13.5px',
  lineHeight: 1.4,
  color: '$stMuted',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const LabelDot = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  '&::before': {
    content: '""',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--label-color)',
  },
  '@smDown': { display: 'none' },
})

// One line of summary, unless it only repeats the title.
const summaryOf = (item: LinkedItemCardProps['item']): string | undefined => {
  const text = item.description?.replace(/\s+/g, ' ').trim()
  if (!text || text.length < 12) {
    return undefined
  }
  const title = item.title.trim().toLowerCase()
  if (text.toLowerCase().startsWith(title)) {
    return undefined
  }
  return text
}

// A library item as a row: serif title, a line of summary, then source,
// time left and progress in small mono. The picture sits at the end, or a
// publication tile when there isn't one. Actions appear on hover or swipe.
export function LibraryListCard(props: LinkedItemCardProps): JSX.Element {
  const router = useRouter()
  const restoreItem = useRestoreItem()
  const [menuOpen, setMenuOpen] = useState(false)
  const { item, isChecked, setIsChecked } = props
  const source = siteName(item.originalArticleUrl, item.url, item.siteName)
  const selecting = props.multiSelectMode !== 'off'
  const progress = Math.round(item.readingProgressPercent ?? 0)
  const started = progress > 0 && progress < 100
  const left = formatMinutes(minutesLeft(item.wordsCount, progress))
  const summary = summaryOf(item)
  const labels = sortedLabels(item.labels).filter(
    ({ name }) => FLAIR_ICON_NAMES.indexOf(name.toLocaleLowerCase()) == -1
  )

  const handleCheckChanged = useCallback(() => {
    setIsChecked(item.id, !isChecked)
  }, [isChecked, setIsChecked, item])

  const stop = (event: React.MouseEvent) => event.stopPropagation()

  // On touch screens a left swipe runs the row's main action.
  const swipe: {
    label: string
    icon: JSX.Element
    action: LinkedItemCardAction
  } =
    item.folder == 'following'
      ? { label: 'Save', icon: <Bookmark size={16} />, action: 'move-to-inbox' }
      : item.state === State.ARCHIVED
      ? { label: 'Unarchive', icon: <Archive size={16} />, action: 'unarchive' }
      : { label: 'Archive', icon: <Archive size={16} />, action: 'archive' }

  const open = (newTab = false) => {
    window.localStorage.setItem('nav-return', router.asPath)
    const path = `/${props.viewer.profile.username}/${item.slug}`
    if (newTab) {
      window.open(path, '_blank')
    } else {
      router.push(path)
    }
  }

  const menuEntries: MenuEntry[] = [
    { label: 'Open', shortcut: '↵', onSelect: () => open() },
    { label: 'Open in new tab', onSelect: () => open(true) },
    item.folder == 'following'
      ? {
          label: 'Save to Library',
          separated: true,
          onSelect: () => props.handleAction('move-to-inbox'),
        }
      : {
          label: item.state === State.ARCHIVED ? 'Unarchive' : 'Archive',
          shortcut: 'E',
          separated: true,
          onSelect: () =>
            props.handleAction(
              item.state === State.ARCHIVED ? 'unarchive' : 'archive'
            ),
        },
    {
      label: 'Labels…',
      shortcut: 'L',
      onSelect: () => props.handleAction('set-labels'),
    },
    {
      label: progress >= 98 ? 'Mark as unread' : 'Mark as read',
      onSelect: () =>
        props.handleAction(progress >= 98 ? 'mark-unread' : 'mark-read'),
    },
    { label: 'Edit info…', onSelect: () => props.handleAction('editTitle') },
    ...linkEntries(item.originalArticleUrl || item.url),
    item.state == State.DELETED
      ? {
          label: 'Restore',
          separated: true,
          onSelect: () => {
            restoreItem.mutateAsync({ itemId: item.id, slug: item.slug })
          },
        }
      : {
          label: 'Delete',
          shortcut: '#',
          destructive: true,
          separated: true,
          onSelect: () => props.handleAction('delete'),
        },
  ]

  return (
    <SwipeAction
      label={swipe.label}
      icon={swipe.icon}
      onAction={() => props.handleAction(swipe.action)}
      disabled={selecting || item.state == State.DELETED}
    >
      <ContextMenu
        entries={selecting ? [] : menuEntries}
        onOpenChange={setMenuOpen}
      >
        <Row
          data-menu-open={menuOpen}
          data-selecting={selecting}
          onClick={(event) => {
            if (selecting) {
              setIsChecked(item.id, !isChecked)
              return
            }
            open(event.metaKey || event.ctrlKey)
          }}
        >
          {selecting && (
            <Leading>
              <CardCheckbox
                isChecked={isChecked}
                handleChanged={handleCheckChanged}
              />
            </Leading>
          )}
          <Body>
            <Title>{item.title}</Title>
            {summary && <Summary>{summary}</Summary>}
            <Meta>
              <SiteIcon
                src={item.siteIcon}
                name={source || item.title}
                size={14}
              />
              {source && <span>{source}</span>}
              {props.isLoading ? (
                <span>Saving…</span>
              ) : (
                <>
                  {left && <span>{left}</span>}
                  {started ? (
                    <Progress
                      role="img"
                      aria-label={`${progress}% read`}
                      title={`${progress}% read`}
                    >
                      <i style={{ width: `${progress}%` }} />
                    </Progress>
                  ) : (
                    item.savedAt && (
                      <span>Saved {timeAgoInSentence(item.savedAt)}</span>
                    )
                  )}
                </>
              )}
              {labels.slice(0, 2).map(({ name, color }) => (
                <LabelDot
                  key={name}
                  style={{ ['--label-color' as string]: color }}
                >
                  {name}
                </LabelDot>
              ))}
            </Meta>
          </Body>
          <Thumb
            src={item.image}
            fallback={
              <PublicationTile>
                <SiteIcon
                  src={item.siteIcon}
                  fallbackSrc={faviconFor(item.originalArticleUrl, item.url)}
                  name={source || item.title}
                  size={18}
                />
                {source && <span>{source}</span>}
              </PublicationTile>
            }
          />
          {!selecting && (
            <Actions onClick={stop}>
              {item.folder == 'following' ? (
                <IconButton
                  label="Save to Library"
                  size="sm"
                  onClick={() => props.handleAction('move-to-inbox')}
                >
                  <Bookmark size={15} />
                </IconButton>
              ) : (
                <IconButton
                  label={
                    item.state === State.ARCHIVED ? 'Unarchive' : 'Archive'
                  }
                  shortcut="e"
                  size="sm"
                  onClick={() =>
                    props.handleAction(
                      item.state === State.ARCHIVED ? 'unarchive' : 'archive'
                    )
                  }
                >
                  <Archive size={15} />
                </IconButton>
              )}
              {item.state == State.DELETED ? (
                <IconButton
                  label="Restore"
                  size="sm"
                  onClick={async () => {
                    await restoreItem.mutateAsync({
                      itemId: item.id,
                      slug: item.slug,
                    })
                  }}
                >
                  <ArrowCounterClockwise size={15} />
                </IconButton>
              ) : (
                <IconButton
                  label="Delete"
                  shortcut="#"
                  size="sm"
                  onClick={() => props.handleAction('delete')}
                >
                  <Trash size={15} />
                </IconButton>
              )}
              <CardMenu
                item={item}
                viewer={props.viewer}
                onOpenChange={setMenuOpen}
                actionHandler={props.handleAction}
                triggerElement={
                  <MenuGlyph aria-label="More actions" title="More actions">
                    <DotsThree size={16} weight="bold" />
                  </MenuGlyph>
                }
              />
            </Actions>
          )}
        </Row>
      </ContextMenu>
    </SwipeAction>
  )
}

type LoadingBarOverlayProps = {
  top: number
  width: string
  bottomRadius: string
  fillColor?: string
  percentFill?: number
}

type ProgressBarOverlayProps = {
  top: number
  width: string
  value: number
  bottomRadius: string
}

export const LoadingBarOverlay = (
  props: LoadingBarOverlayProps
): JSX.Element => {
  return (
    <Box
      css={{
        position: 'absolute',
        width: props.width,
        top: props.top,
        borderBottomLeftRadius: props.bottomRadius,
        borderBottomRightRadius: props.bottomRadius,
        overflow: 'clip',
        zIndex: 2,
      }}
    >
      <LoadingBar
        fillColor={props.fillColor ?? theme.colors.thProgressFg.toString()}
        backgroundColor="rgba(217, 217, 217, 0.65)"
        borderRadius={'2px'}
        percentFill={props.percentFill}
      />
    </Box>
  )
}

export const ProgressBarOverlay = (
  props: ProgressBarOverlayProps
): JSX.Element => {
  return (
    <Box
      css={{
        position: 'absolute',
        width: props.width,
        top: props.top,
        borderBottomLeftRadius: props.bottomRadius,
        borderBottomRightRadius: props.bottomRadius,
        overflow: 'clip',
        zIndex: 2,
      }}
    >
      <ProgressBar
        fillPercentage={props.value}
        fillColor={theme.colors.thProgressFg.toString()}
        backgroundColor="rgba(217, 217, 217, 0.65)"
        borderRadius={'2px'}
      />
    </Box>
  )
}
