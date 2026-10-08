import { Archive, ArrowRight } from '@phosphor-icons/react'
import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'
import { State } from '../../../lib/networking/fragments/articleFragment'
import {
  ArticleAttributes,
  useArchiveItem,
  useGetLibraryItems,
} from '../../../lib/networking/library_items/useLibraryItems'
import { formatMinutes, readingMinutes } from '../../../lib/readingTime'
import { siteName } from '../../../lib/textFormatting'
import { showErrorToast } from '../../../lib/toastHelpers'
import { SiteIcon } from '../../elements/stash'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'

const Card = styled('section', {
  display: 'grid',
  gap: '18px',
  width: '100%',
  boxSizing: 'border-box',
  margin: '56px 0 24px',
  padding: '22px',
  fontFamily: '$inter',
  color: '$stInk',
  background: '$stSurface',
  border: '1px solid $stLine',
  borderRadius: '$lg',
  '@media print': { display: 'none' },
})

const Kicker = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontFamily: '$mono',
  fontSize: '$micro',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '$stMuted',
  '&::before': {
    content: '""',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '$stAccent',
  },
})

const Buttons = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
})

const Button = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  height: '36px',
  padding: '0 14px',
  fontSize: '$small',
  fontWeight: 500,
  borderRadius: '$sm',
  cursor: 'pointer',
  transition: `background ${motion.fast}, border-color ${motion.fast}`,
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
  '&:disabled': { opacity: 0.6, cursor: 'default' },
  variants: {
    primary: {
      true: {
        color: '$stOnAccent',
        background: '$stAccent',
        '&:hover': { filter: 'brightness(1.05)' },
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
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '12px',
  padding: '12px',
  margin: '0 -12px -12px',
  borderTop: '1px solid $stLine',
  borderRadius: '0 0 $md $md',
  color: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
})

const NextTitle = styled('div', {
  fontSize: '$small',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const NextMeta = styled('div', {
  fontSize: '$caption',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

type FinishCardProps = {
  item: ArticleAttributes
  username: string
  onDone: () => void
}

// Shown at the end of an article: what you read, and a way straight on to the
// next thing in the inbox.
export function FinishCard(props: FinishCardProps): JSX.Element {
  const router = useRouter()
  const archiveItem = useArchiveItem()
  const [busy, setBusy] = useState(false)
  const { item } = props
  const archived = item.state == State.ARCHIVED

  const nextQuery = useGetLibraryItems('reader-next', 'inbox', {
    limit: 4,
    sortDescending: true,
    searchQuery: 'is:unread sort:saved-desc',
  })
  const next = useMemo(
    () =>
      (nextQuery.data?.pages ?? [])
        .flatMap((page) => page.edges)
        .map((edge) => edge.node)
        .find(
          (node) =>
            node.id != item.id &&
            node.state != State.ARCHIVED &&
            node.state != State.DELETED
        ),
    [nextQuery.data, item.id]
  )

  const minutes = formatMinutes(readingMinutes(item.wordsCount))
  const highlightCount =
    item.highlights?.filter((h) => h.type == 'HIGHLIGHT').length ?? 0
  const summary = [
    'Finished',
    minutes,
    highlightCount == 1 ? '1 highlight' : `${highlightCount} highlights`,
  ]
    .filter(Boolean)
    .join(' · ')

  const openNext = () => {
    if (next) {
      router.push(`/${props.username}/${next.slug}`)
    } else {
      props.onDone()
    }
  }

  const archiveAndNext = async () => {
    setBusy(true)
    try {
      if (!archived) {
        await archiveItem.mutateAsync({
          itemId: item.id,
          slug: item.slug,
          input: { linkId: item.id, archived: true },
        })
      }
      openNext()
    } catch {
      showErrorToast('Could not archive this item', {
        position: 'bottom-right',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card aria-label="Finished reading">
      <Kicker>{summary}</Kicker>
      <Buttons>
        <Button primary disabled={busy} onClick={archiveAndNext}>
          {archived ? <ArrowRight size={16} /> : <Archive size={16} />}
          {archived
            ? next
              ? 'Read next'
              : 'Back to Stash'
            : next
            ? 'Archive and read next'
            : 'Archive'}
        </Button>
        {!archived && <Button onClick={props.onDone}>Keep in inbox</Button>}
      </Buttons>
      {next && (
        <Next
          href={`/${props.username}/${next.slug}`}
          onClick={(event) => {
            event.preventDefault()
            openNext()
          }}
        >
          <SiteIcon
            src={next.siteIcon}
            name={siteName(next.originalArticleUrl, next.url, next.siteName)}
            size={20}
          />
          <div style={{ minWidth: 0 }}>
            <NextMeta>Next up</NextMeta>
            <NextTitle>{next.title}</NextTitle>
          </div>
          <NextMeta>{formatMinutes(readingMinutes(next.wordsCount))}</NextMeta>
        </Next>
      )}
    </Card>
  )
}
