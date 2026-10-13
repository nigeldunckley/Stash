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
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '8px',
})

const Button = styled('button', {
  all: 'unset',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  justifyContent: 'center',
  height: '40px',
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
  border: '1px solid $stLine',
  borderRadius: '$md',
  color: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
  '&:hover': { background: '$stSunken' },
})

const NextTitle = styled('div', {
  fontFamily: '$serif',
  fontSize: '16px',
  lineHeight: 1.3,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

const NextMeta = styled('div', {
  fontSize: '$caption',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

const Keep = styled('button', {
  all: 'unset',
  justifySelf: 'center',
  fontSize: '$caption',
  color: '$stMuted',
  cursor: 'pointer',
  textDecoration: 'underline',
  textDecorationColor: '$stLine',
  textUnderlineOffset: '3px',
  '&:hover': { color: '$stInk' },
  '&:focus-visible': { outline: '2px solid $stAccent', outlineOffset: '2px' },
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
    return node ? { node, why: 'Newest in your inbox' } : undefined
  }, [readingQuery.data, inboxQuery.data, item.id])

  const site = siteName(item.originalArticleUrl, item.url, item.siteName)
  const minutes = formatMinutes(readingMinutes(item.wordsCount))
  const summary = ['Finished', site, minutes].filter(Boolean).join(' · ')

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

  return (
    <Card aria-label="Finished reading">
      <Kicker>{summary}</Kicker>
      <Buttons>
        <Button disabled={busy} onClick={() => archiveThen(props.onDone)}>
          {archived ? 'Back to Stash' : 'Archive and close'}
        </Button>
        {next && (
          <Button primary disabled={busy} onClick={() => archiveThen(openNext)}>
            {archived ? 'Read next' : 'Archive, read next'}
          </Button>
        )}
      </Buttons>
      {next && (
        <Next
          href={`/${props.username}/${next.node.slug}`}
          onClick={(event) => {
            event.preventDefault()
            openNext()
          }}
        >
          <SiteIcon
            src={next.node.siteIcon}
            name={siteName(
              next.node.originalArticleUrl,
              next.node.url,
              next.node.siteName
            )}
            size={20}
          />
          <div style={{ minWidth: 0 }}>
            <NextMeta>Next up · {next.why}</NextMeta>
            <NextTitle>{next.node.title}</NextTitle>
          </div>
          <NextMeta>
            {formatMinutes(readingMinutes(next.node.wordsCount))}
          </NextMeta>
        </Next>
      )}
      {!archived && (
        <Keep type="button" onClick={props.onDone}>
          or keep it in the inbox
        </Keep>
      )}
    </Card>
  )
}
