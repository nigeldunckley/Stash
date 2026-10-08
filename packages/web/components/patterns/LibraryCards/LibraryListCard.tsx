import {
  Archive,
  ArrowCounterClockwise,
  Bookmark,
  DotsThree,
  Tag,
  Trash,
} from '@phosphor-icons/react'
import { useRouter } from 'next/router'
import { useCallback, useState } from 'react'
import { State } from '../../../lib/networking/fragments/articleFragment'
import { useRestoreItem } from '../../../lib/networking/library_items/useLibraryItems'
import { formatMinutes, minutesLeft } from '../../../lib/readingTime'
import { siteName } from '../../../lib/textFormatting'
import { sortedLabels } from '../../../lib/labelsSort'
import { Box } from '../../elements/LayoutPrimitives'
import { LoadingBar } from '../../elements/LoadingBar'
import { ProgressBar } from '../../elements/ProgressBar'
import {
  IconButton,
  ProgressRing,
  SiteIcon,
  SwipeAction,
} from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled, theme } from '../../tokens/stitches.config'
import { CardMenu } from '../CardMenu'
import type { LinkedItemCardAction, LinkedItemCardProps } from './CardTypes'
import { CardCheckbox, FLAIR_ICON_NAMES } from './LibraryCardStyles'

const Actions = styled('div', {
  display: 'none',
  alignItems: 'center',
  gap: '2px',
})

const Meta = styled('span', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
})

const Row = styled('div', {
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  minHeight: '56px',
  padding: '10px 12px',
  boxSizing: 'border-box',
  cursor: 'pointer',
  color: '$stInk',
  fontFamily: '$inter',
  transition: `background ${motion.fast}`,
  '@media (hover: hover)': {
    '&:hover': { background: '$stSunken' },
    [`&:hover ${Actions}`]: { display: 'flex' },
    [`&:hover ${Meta}`]: { display: 'none' },
  },
  [`&[data-menu-open="true"] ${Actions}`]: { display: 'flex' },
  [`&[data-menu-open="true"] ${Meta}`]: { display: 'none' },
  '@media (hover: none)': {
    [`& ${Meta}`]: { display: 'flex' },
  },
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
    background: '$stSurface',
    borderColor: '$stLine',
  },
})

const Leading = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minWidth: '20px',
  input: { margin: 0 },
})

const Body = styled('div', {
  minWidth: 0,
  display: 'grid',
  gap: '2px',
})

const Title = styled('div', {
  fontSize: '$small',
  fontWeight: 500,
  lineHeight: 1.35,
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const Subtitle = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  fontSize: '$caption',
  lineHeight: 1.35,
  color: '$stMuted',
  '& > span:first-child': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})

const LabelDot = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  flex: 'none',
  fontSize: '$micro',
  color: '$stMuted',
  '&::before': {
    content: '""',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--label-color)',
  },
  '@smDown': { display: 'none' },
})

// A library item as a single dense row: favicon, title, author and source, and
// read time with progress. Actions replace the read time on hover.
export function LibraryListCard(props: LinkedItemCardProps): JSX.Element {
  const router = useRouter()
  const restoreItem = useRestoreItem()
  const [menuOpen, setMenuOpen] = useState(false)
  const { item, isChecked, setIsChecked } = props
  const source = siteName(item.originalArticleUrl, item.url, item.siteName)
  const selecting = props.multiSelectMode !== 'off'
  const left = formatMinutes(
    minutesLeft(item.wordsCount, item.readingProgressPercent)
  )
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

  return (
    <SwipeAction
      label={swipe.label}
      icon={swipe.icon}
      onAction={() => props.handleAction(swipe.action)}
      disabled={selecting || item.state == State.DELETED}
    >
      <Row
        data-menu-open={menuOpen}
        onClick={(event) => {
          if (selecting) {
            setIsChecked(item.id, !isChecked)
            return
          }
          window.localStorage.setItem('nav-return', router.asPath)
          const path = `/${props.viewer.profile.username}/${item.slug}`
          if (event.metaKey || event.ctrlKey) {
            window.open(path, '_blank')
          } else {
            router.push(path)
          }
        }}
      >
        <Leading>
          {selecting && (
            <CardCheckbox
              isChecked={isChecked}
              handleChanged={handleCheckChanged}
            />
          )}
          <SiteIcon src={item.siteIcon} name={source || item.title} size={20} />
        </Leading>
        <Body>
          <Title>{item.title}</Title>
          <Subtitle>
            <span>{[item.author, source].filter(Boolean).join(' · ')}</span>
            {labels.slice(0, 3).map(({ name, color }) => (
              <LabelDot
                key={name}
                style={{ ['--label-color' as string]: color }}
              >
                {name}
              </LabelDot>
            ))}
          </Subtitle>
        </Body>
        <div onClick={stop} style={{ display: 'flex', alignItems: 'center' }}>
          {props.isLoading ? (
            <Meta>Saving…</Meta>
          ) : (
            <Meta>
              {left}
              <ProgressRing percent={item.readingProgressPercent} />
            </Meta>
          )}
          {!selecting && (
            <Actions>
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
              <IconButton
                label="Labels"
                shortcut="l"
                size="sm"
                onClick={() => props.handleAction('set-labels')}
              >
                <Tag size={15} />
              </IconButton>
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
        </div>
      </Row>
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
