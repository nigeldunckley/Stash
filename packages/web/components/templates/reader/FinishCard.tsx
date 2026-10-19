import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'
import { State } from '../../../lib/networking/fragments/articleFragment'
import {
  ArticleAttributes,
  useArchiveItem,
  LibraryItemNode,
  useGetLibraryItems,
} from '../../../lib/networking/library_items/useLibraryItems'
import { formatMinutes, readingMinutes } from '../../../lib/readingTime'
import { siteName } from '../../../lib/textFormatting'
import { showErrorToast } from '../../../lib/toastHelpers'
import { motion, pressable } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'

// The colophon at the end of an article: a fine rule, a few facts about
// the piece in mono, then what to read next. It follows the end mark (the
// orange square after the last word), as a magazine closes a story.
const Card = styled('section', {
  display: 'grid',
  gap: '22px',
  width: '100%',
  boxSizing: 'border-box',
  margin: '56px 0 24px',
  paddingTop: '14px',
  fontFamily: '$inter',
  color: '$stInk',
  borderTop: '1px solid $stInk',
  '@media print': { display: 'none' },
})

const Facts = styled('dl', {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '16px',
  margin: 0,
  '@smDown': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  '& > div': { display: 'grid', gap: '4px', minWidth: 0 },
  dt: {
    fontFamily: '$mono',
    fontSize: '10px',
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: '$stMuted',
  },
  dd: {
    margin: 0,
    fontFamily: '$mono',
    fontSize: '13px',
    color: '$stInk',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
})

const Buttons = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '8px',
})

const Button = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '34px',
  padding: '0 14px',
  fontSize: '$small',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  borderRadius: '$sm',
  cursor: 'pointer',
  transition: `background ${motion.fast}, border-color ${motion.fast}`,
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '&:disabled': { opacity: 0.6, cursor: 'default' },
  ...pressable,
  variants: {
    primary: {
      true: {
        color: '$stSurface',
        background: '$stInk',
        '&:hover': { opacity: 0.88 },
      },
      false: {
        color: '$stInk',
        border: '1px solid $stLine',
        '&:hover': { background: '$stSunken' },
      },
    },
  },
  defaultVariants: { primary: false },
})

const Next = styled('a', {
  display: 'grid',
  gap: '4px',
  padding: '16px 18px',
  border: '1px solid $stLine',
  borderRadius: '$md',
  color: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
})

const NextKicker = styled('div', {
  fontFamily: '$mono',
  fontSize: '10px',
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: '$stAccentText',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const NextTitle = styled('div', {
  fontFamily: '$serif',
  fontSize: '19px',
  fontWeight: 500,
  lineHeight: 1.25,
  letterSpacing: '-0.01em',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const isOpen = (node: { state?: State; readingProgressPercent?: number }) =>
  node.state != State.ARCHIVED &&
  node.state != State.DELETED &&
  (node.readingProgressPercent ?? 0) < 90

type FinishCardProps = {
  item: ArticleAttributes
  username: string
  onDone: () => void
}

// Shown at the end of an article. Stopping and carrying on get equal
// weight, and "Next up" follows Home's Up next: something you've started
// first, then the newest save.
export function FinishCard(props: FinishCardProps): JSX.Element {
  const router = useRouter()
  const archiveItem = useArchiveItem()
  const [busy, setBusy] = useState(false)
  const { item } = props
  const archived = item.state == State.ARCHIVED

  // The same order as Home's Up next: anything started, then the newest
  // unread save.
  const readingQuery = useGetLibraryItems('reader-next-reading', 'inbox', {
    limit: 4,
    sortDescending: true,
    searchQuery: 'is:reading sort:read-desc',
  })
  const inboxQuery = useGetLibraryItems('reader-next', 'inbox', {
    limit: 4,
    sortDescending: true,
    searchQuery: 'is:unread sort:saved-desc',
  })

  const next = useMemo(() => {
    const first = (pages?: { edges: { node: LibraryItemNode }[] }[]) =>
      (pages ?? [])
        .flatMap((page) => page.edges)
        .map((edge) => edge.node)
        .find((node) => node.id != item.id && isOpen(node))
    const started = first(readingQuery.data?.pages)
    if (started) return { node: started, why: 'Pick up again' }
    const node = first(inboxQuery.data?.pages)
    return node ? { node, why: 'Newest in Saved' } : undefined
  }, [readingQuery.data, inboxQuery.data, item.id])

  const site = siteName(item.originalArticleUrl, item.url, item.siteName)
  const minutes = formatMinutes(readingMinutes(item.wordsCount))
  const highlights = (item.highlights ?? []).filter(
    (highlight) => highlight.type == 'HIGHLIGHT'
  ).length
  const saved = item.savedAt
    ? new Date(item.savedAt).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : undefined

  const openNext = () => {
    if (next) {
      router.push(`/${props.username}/${next.node.slug}`)
    } else {
      props.onDone()
    }
  }

  const archiveThen = async (then: () => void) => {
    setBusy(true)
    try {
      if (!archived) {
        await archiveItem.mutateAsync({
          itemId: item.id,
          slug: item.slug,
          input: { linkId: item.id, archived: true },
        })
      }
      then()
    } catch {
      showErrorToast('Could not archive this item', {
        position: 'bottom-right',
      })
    } finally {
      setBusy(false)
    }
  }

  const nextMinutes = next
    ? formatMinutes(readingMinutes(next.node.wordsCount))
    : undefined

  return (
    <Card aria-label="Finished reading">
      <Facts>
        {minutes && (
          <div>
            <dt>Length</dt>
            <dd>{minutes}</dd>
          </div>
        )}
        <div>
          <dt>Highlights</dt>
          <dd>{highlights == 0 ? 'None' : `${highlights} kept`}</dd>
        </div>
        {site && (
          <div>
            <dt>From</dt>
            <dd>{site}</dd>
          </div>
        )}
        {saved && (
          <div>
            <dt>Saved</dt>
            <dd>{saved}</dd>
          </div>
        )}
      </Facts>
      {next && (
        <Next
          href={`/${props.username}/${next.node.slug}`}
          onClick={(event) => {
            event.preventDefault()
            openNext()
          }}
        >
          <NextKicker>
            {['Next', nextMinutes, next.why].filter(Boolean).join(' · ')}
          </NextKicker>
          <NextTitle>{next.node.title}</NextTitle>
        </Next>
      )}
      <Buttons>
        {next && (
          <Button primary disabled={busy} onClick={() => archiveThen(openNext)}>
            {archived ? 'Read next' : 'Archive and read next'}
          </Button>
        )}
        <Button
          primary={!next}
          disabled={busy}
          onClick={() => archiveThen(props.onDone)}
        >
          {archived ? 'Back to Stash' : 'Archive and close'}
        </Button>
        {!archived && (
          <Button type="button" onClick={props.onDone}>
            Keep in Saved
          </Button>
        )}
      </Buttons>
    </Card>
  )
}
