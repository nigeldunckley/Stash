import {
  Archive,
  Books,
  HighlighterCircle,
  MagnifyingGlass,
  Rss,
  Trash,
} from '@phosphor-icons/react'
import { useGetSubscriptions } from '../../../lib/networking/subscriptions/useGetSubscriptions'
import { EmptyState } from '../../elements/stash/EmptyState'

type EmptyLibraryProps = {
  folder: string | undefined
  searchTerm?: string
  onAddLinkClicked?: () => void | undefined
}

const ICON_SIZE = 24

export const EmptyLibrary = (props: EmptyLibraryProps) => {
  // For feeds, say whether there are no feeds or just nothing new.
  const { data: subscriptions, isLoading } = useGetSubscriptions(
    {},
    props.folder == 'following' || props.folder == 'subscriptions'
  )
  const search = props.searchTerm?.trim()

  if (search == 'is:unread') {
    return (
      <EmptyState icon={<Books size={ICON_SIZE} />} title="All caught up">
        Everything in your Library has been read.
      </EmptyState>
    )
  }
  if (search == 'is:reading') {
    return (
      <EmptyState icon={<Books size={ICON_SIZE} />} title="Nothing in progress">
        Articles you’ve started but not finished will appear here.
      </EmptyState>
    )
  }
  if (search) {
    return (
      <EmptyState
        icon={<MagnifyingGlass size={ICON_SIZE} />}
        title="No results"
      >
        Nothing matches “{search}”. Try different words or check the spelling.
      </EmptyState>
    )
  }

  switch (props.folder) {
    case 'highlights':
      return (
        <EmptyState
          icon={<HighlighterCircle size={ICON_SIZE} />}
          title="No highlights yet"
        >
          Select text while you read to highlight it. Your highlights collect
          here.
        </EmptyState>
      )
    case 'trash':
      return (
        <EmptyState icon={<Trash size={ICON_SIZE} />} title="Trash is empty">
          Deleted items wait here before they’re removed for good.
        </EmptyState>
      )
    case 'archive':
      return (
        <EmptyState
          icon={<Archive size={ICON_SIZE} />}
          title="Nothing archived"
        >
          Archived items leave your Library but stay here, and in search, for
          good.
        </EmptyState>
      )
    case 'following':
    case 'subscriptions':
      return isLoading || (subscriptions?.length ?? 0) > 0 ? (
        <EmptyState icon={<Rss size={ICON_SIZE} />} title="Nothing new">
          New posts from your feeds will appear here.
        </EmptyState>
      ) : (
        <EmptyState icon={<Rss size={ICON_SIZE} />} title="No feeds yet">
          Follow a site’s RSS feed or a YouTube channel from Settings › Feeds.
        </EmptyState>
      )
  }
  return (
    <EmptyState
      icon={<Books size={ICON_SIZE} />}
      title="Your Library is empty"
      action={
        props.onAddLinkClicked
          ? { label: 'Add a link', onClick: props.onAddLinkClicked }
          : undefined
      }
    >
      Save articles from Safari’s Share Sheet, the Save to Stash button, or by
      pasting a link.
    </EmptyState>
  )
}
