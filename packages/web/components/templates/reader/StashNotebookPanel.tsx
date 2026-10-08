import { Copy, Tag, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { formattedLongDate } from '../../../lib/dateFormatting'
import useGetWindowDimensions from '../../../lib/hooks/useGetWindowDimensions'
import {
  ReadableItem,
  useGetLibraryItemContent,
} from '../../../lib/networking/library_items/useLibraryItems'
import { UserBasicData } from '../../../lib/networking/queries/useGetViewerQuery'
import { formatMinutes, readingMinutes } from '../../../lib/readingTime'
import { siteName } from '../../../lib/textFormatting'
import { showErrorToast, showSuccessToast } from '../../../lib/toastHelpers'
import {
  BottomSheet,
  IconButton,
  PanelLabel,
  SegmentedControl,
} from '../../elements/stash'
import { motion, reducedMotion } from '../../elements/stash/motion'
import { keyframes, styled } from '../../tokens/stitches.config'
import { NotebookContent } from '../article/Notebook'
import { highlightsAsMarkdown } from '../homeFeed/HighlightItem'

export const NOTEBOOK_WIDTH = 360
// From this width the panel sits beside the article instead of over it.
export const NOTEBOOK_DOCKED = '@media (min-width: 1100px)'
const SHEET_BELOW = 768

const slideIn = keyframes({
  from: { transform: 'translateX(16px)', opacity: 0 },
  to: { transform: 'translateX(0)', opacity: 1 },
})

const Panel = styled('aside', {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: 20,
  width: `${NOTEBOOK_WIDTH}px`,
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  background: '$stSurface',
  color: '$stInk',
  borderLeft: '1px solid $stLine',
  boxShadow: '-12px 0 32px rgba(0, 0, 0, 0.06)',
  fontFamily: '$inter',
  animation: `${slideIn} 200ms cubic-bezier(0.2, 0, 0, 1)`,
  [reducedMotion]: { animation: 'none' },
  [NOTEBOOK_DOCKED]: { boxShadow: 'none' },
  '@media print': { display: 'none' },
})

const Header = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: '52px',
  padding: '0 10px 0 14px',
  borderBottom: '1px solid $stLine',
  flex: 'none',
})

const Scroll = styled('div', {
  flex: 1,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
})

const Count = styled('span', {
  marginLeft: '6px',
  fontFamily: '$mono',
  fontSize: '$micro',
  color: '$stMuted',
})

const InfoList = styled('dl', {
  display: 'grid',
  gridTemplateColumns: '88px minmax(0, 1fr)',
  rowGap: '10px',
  columnGap: '12px',
  margin: 0,
  fontSize: '$small',
  dt: {
    fontFamily: '$mono',
    fontSize: '$micro',
    lineHeight: '20px',
    color: '$stMuted',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  dd: {
    margin: 0,
    lineHeight: '20px',
    color: '$stInk2',
    overflowWrap: 'anywhere',
  },
  a: {
    color: '$stInk',
    textDecoration: 'underline',
    textDecorationColor: '$stLineStrong',
    textUnderlineOffset: '3px',
    '&:hover': { textDecorationColor: '$stAccent' },
  },
})

const Labels = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
})

const Label = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '24px',
  padding: '0 8px',
  fontSize: '$caption',
  color: '$stInk2',
  border: '1px solid $stLine',
  borderRadius: '$sm',
  '&::before': {
    content: '""',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--label-color)',
  },
})

const TextButton = styled('button', {
  all: 'unset',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '28px',
  padding: '0 10px',
  fontSize: '$caption',
  color: '$stInk',
  border: '1px solid $stLine',
  borderRadius: '$sm',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '1px' },
})

type Tab = 'highlights' | 'info'

type StashNotebookPanelProps = {
  open: boolean
  onClose: () => void
  viewer: UserBasicData
  item: ReadableItem
  viewInReader: (highlightId: string) => void
}

// The reader's notebook: highlights and notes, and the item's details. A panel
// on the right on wide screens, a bottom sheet on iPhone.
export function StashNotebookPanel(props: StashNotebookPanelProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('highlights')
  const { width } = useGetWindowDimensions()
  const sheet = width > 0 && width < SHEET_BELOW
  const { data: article } = useGetLibraryItemContent(
    props.viewer.profile.username as string,
    props.item.slug as string
  )
  const highlightCount =
    article?.highlights?.filter((h) => h.type == 'HIGHLIGHT').length ?? 0

  // The page reads this to make room for the docked panel.
  useEffect(() => {
    if (props.open && !sheet) {
      document.body.dataset.notebook = 'open'
    } else {
      delete document.body.dataset.notebook
    }
    return () => {
      delete document.body.dataset.notebook
    }
  }, [props.open, sheet])

  const { onClose } = props
  useEffect(() => {
    if (!props.open || sheet) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key == 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [props.open, sheet, onClose])

  const copyMarkdown = useCallback(() => {
    if (!article) {
      showErrorToast('Could not copy highlights')
      return
    }
    const highlights = highlightsAsMarkdown(article.highlights ?? [])
    if (!highlights.trim()) {
      showSuccessToast('Nothing to copy yet')
      return
    }
    const lines = [`## ${article.title}`]
    if (article.contentReader == 'WEB' && article.originalArticleUrl) {
      lines.push(`URL: ${article.originalArticleUrl}`)
    }
    ;(async () => {
      await navigator.clipboard.writeText(
        lines.join('\n') + '\n\n' + highlights
      )
      showSuccessToast('Highlights and notes copied as Markdown')
    })()
  }, [article])

  const tabs = (
    <SegmentedControl
      label="Notebook view"
      value={tab}
      onChange={setTab}
      options={[
        {
          value: 'highlights',
          label: highlightCount
            ? `Highlights ${highlightCount}`
            : 'Highlights',
        },
        { value: 'info', label: 'Info' },
      ]}
    />
  )

  const copyButton = (
    <IconButton label="Copy as Markdown" onClick={copyMarkdown}>
      <Copy size={16} />
    </IconButton>
  )

  const body =
    tab == 'highlights' ? (
      <NotebookContent
        viewer={props.viewer}
        item={props.item}
        viewInReader={(id) => {
          if (sheet) {
            props.onClose()
          }
          props.viewInReader(id)
        }}
      />
    ) : (
      <Info article={article} />
    )

  if (sheet) {
    return (
      <BottomSheet
        open={props.open}
        onOpenChange={(open) => !open && props.onClose()}
        title="Notebook"
        headerAction={copyButton}
      >
        <div style={{ marginBottom: 4 }}>{tabs}</div>
        {body}
      </BottomSheet>
    )
  }

  if (!props.open) {
    return <></>
  }

  return (
    <Panel aria-label="Notebook">
      <Header>
        {tabs}
        <span style={{ flex: 1 }} />
        {copyButton}
        <IconButton label="Close notebook" shortcut="t" onClick={props.onClose}>
          <X size={16} />
        </IconButton>
      </Header>
      <Scroll>{body}</Scroll>
    </Panel>
  )
}

type InfoProps = {
  article: ReturnType<typeof useGetLibraryItemContent>['data']
}

function Info({ article }: InfoProps): JSX.Element {
  if (!article) {
    return <></>
  }
  const source = siteName(
    article.originalArticleUrl,
    article.url,
    article.siteName
  )
  const minutes = readingMinutes(article.wordsCount)

  return (
    <div style={{ display: 'grid', gap: 22, padding: '20px' }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div
          style={{
            fontFamily: 'var(--fonts-display)',
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
          }}
        >
          {article.title}
        </div>
        {article.description && (
          <Muted>{article.description}</Muted>
        )}
      </div>
      <InfoList>
        {article.author && (
          <>
            <dt>Author</dt>
            <dd>{article.author}</dd>
          </>
        )}
        {source && (
          <>
            <dt>Source</dt>
            <dd>
              <a
                href={article.originalArticleUrl}
                target="_blank"
                rel="noreferrer"
              >
                {source}
              </a>
            </dd>
          </>
        )}
        {article.publishedAt && (
          <>
            <dt>Published</dt>
            <dd>{formattedLongDate(article.publishedAt)}</dd>
          </>
        )}
        <dt>Saved</dt>
        <dd>{formattedLongDate(article.savedAt || article.createdAt)}</dd>
        {minutes !== undefined && (
          <>
            <dt>Length</dt>
            <dd>
              {formatMinutes(minutes)} ·{' '}
              {(article.wordsCount ?? 0).toLocaleString()} words
            </dd>
          </>
        )}
        <dt>Progress</dt>
        <dd>{Math.round(article.readingProgressPercent ?? 0)}%</dd>
      </InfoList>
      <div style={{ display: 'grid', gap: 10 }}>
        <PanelLabel>Labels</PanelLabel>
        {article.labels && article.labels.length > 0 && (
          <Labels>
            {article.labels.map((label) => (
              <Label
                key={label.id}
                style={{ ['--label-color' as string]: label.color }}
              >
                {label.name}
              </Label>
            ))}
          </Labels>
        )}
        <div>
          <TextButton
            onClick={() => document.dispatchEvent(new Event('editLabels'))}
          >
            <Tag size={14} />
            {article.labels?.length ? 'Edit labels' : 'Add labels'}
          </TextButton>
        </div>
      </div>
    </div>
  )
}

const Muted = styled('p', {
  margin: 0,
  fontSize: '$small',
  lineHeight: 1.5,
  color: '$stMuted',
})
