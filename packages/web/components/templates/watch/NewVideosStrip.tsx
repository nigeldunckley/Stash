import { ArrowRight } from '@phosphor-icons/react'
import Link from 'next/link'
import { useMemo } from 'react'
import {
  LibraryItemNode,
  useGetLibraryItems,
} from '../../../lib/networking/library_items/useLibraryItems'
import { subscriptionName } from '../../../lib/networking/subscriptions/feeds'
import { useGetSubscriptions } from '../../../lib/networking/subscriptions/useGetSubscriptions'
import { shortTimeAgo } from '../../../lib/textFormatting'
import { useOpenVideo } from '../../../lib/watch/player'
import { styled } from '../../tokens/stitches.config'
import { isVisible } from '../feeds/feedRowParts'
import { VideoCard } from '../feeds/VideoCard'

const Section = styled('section', {
  margin: '0 0 30px',
  // The row scrolls sideways inside the column rather than widening it.
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
})

const Head = styled('div', {
  display: 'flex',
  alignItems: 'baseline',
  gap: '10px',
  marginBottom: '12px',
  '& h2': {
    margin: 0,
    fontFamily: '$inter',
    fontSize: '$ui',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: '$stInk',
  },
  '& > span': {
    fontFamily: '$mono',
    fontSize: '$micro',
    color: '$stAccentText',
  },
  '& a': {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontFamily: '$inter',
    fontSize: '$caption',
    color: '$stMuted',
    textDecoration: 'none',
    '&:hover': { color: '$stInk' },
  },
})

const Row = styled('div', {
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: 'minmax(200px, calc((100% - 54px) / 4))',
  gap: '18px',
  overflowX: 'auto',
  scrollSnapType: 'x mandatory',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
  '& > *': { scrollSnapAlign: 'start' },
  '@smDown': { gridAutoColumns: '70%', gap: '14px' },
})

// New videos from your channels, on Home, so they reach you even on days
// you don't open Watch. Tapping one plays it.
export function NewVideosStrip(props: { now: number }): JSX.Element | null {
  const openVideo = useOpenVideo()
  const { data: subscriptions } = useGetSubscriptions({})
  const { data } = useGetLibraryItems(
    'home-new-videos',
    'following',
    {
      limit: 8,
      sortDescending: true,
      searchQuery: 'type:video -is:seen sort:published-desc',
      includeCount: true,
    },
    true,
    2 * 60 * 1000
  )
  const items = useMemo(
    () =>
      (data?.pages[0]?.edges ?? []).map((edge) => edge.node).filter(isVisible),
    [data]
  )
  const total = data?.pages[0]?.pageInfo.totalCount ?? items.length
  if (!items.length) return null

  const channelOf = (item: LibraryItemNode) =>
    subscriptions?.find((s) => s.url == item.subscription)
  return (
    <Section aria-label="New videos">
      <Head>
        <h2>New videos</h2>
        <span>{total} new</span>
        <Link href="/l/watch">
          Open Watch <ArrowRight size={12} />
        </Link>
      </Head>
      <Row>
        {items.map((item) => (
          <VideoCard
            key={item.id}
            item={item}
            channelName={
              subscriptionName(item.subscription, subscriptions) ||
              item.author ||
              ''
            }
            channelIcon={channelOf(item)?.icon}
            showChannel
            age={shortTimeAgo(item.publishedAt || item.savedAt, props.now)}
            seen={false}
            saved={false}
            queued
            selected={false}
            onOpen={() => openVideo(item)}
            onFocus={() => undefined}
            onSave={() => undefined}
            onArchive={() => undefined}
            onOpenOriginal={() =>
              window.open(
                item.originalArticleUrl || item.url,
                '_blank',
                'noreferrer'
              )
            }
          />
        ))}
      </Row>
    </Section>
  )
}
