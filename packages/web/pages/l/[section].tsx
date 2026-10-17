import { useRouter } from 'next/router'
import { useApplyLocalTheme } from '../../lib/hooks/useApplyLocalTheme'
import {
  NavigationLayout,
  NavigationSection,
} from '../../components/templates/NavigationLayout'
import { StashEdition } from '../../components/templates/home/StashEdition'
import { StashHome } from '../../components/templates/home/StashHome'
import { StashFeeds } from '../../components/templates/feeds/StashFeeds'
import { WatchPlayerPage } from '../../components/templates/watch/WatchPlayerPage'
import { LibraryContainer } from '../../components/templates/library/LibraryContainer'
import { useMemo } from 'react'
import { HighlightsContainer } from '../../components/nav-containers/HighlightsContainer'
import { usePersistedState } from '../../lib/hooks/usePersistedState'
import { State } from '../../lib/networking/fragments/articleFragment'
import { StashDiscover } from '../../components/templates/discover/StashDiscover'

export default function Home(): JSX.Element {
  const router = useRouter()
  useApplyLocalTheme()

  const [showNavigationMenu, setShowNavigationMenu, isShowNavigationLoading] =
    usePersistedState<boolean>({
      key: 'nav-show-menu',
      isSessionStorage: false,
      initialValue: false,
      defaultEvaluator: () => {
        return window.innerWidth > 1000
      },
    })

  const section: NavigationSection | undefined = useMemo(() => {
    if (!router.isReady) {
      return undefined
    }
    const res = router.query.section
    if (typeof res !== 'string') {
      return undefined
    }
    return res as NavigationSection
  }, [router])

  const sectionView = (name: string | string[] | undefined) => {
    if (typeof name !== 'string' || isShowNavigationLoading) {
      return <></>
    }
    switch (name) {
      case 'home':
        return <StashHome key={name} />
      case 'edition':
        return <StashEdition key={name} />
      case 'highlights':
        return <HighlightsContainer />
      case 'library':
        return (
          <LibraryContainer
            key={name}
            folder="inbox"
            // Videos saved to watch later live in Watch.
            defaultSearch="-type:video"
            filterFunc={(item) => {
              return (
                item.state !== State.ARCHIVED &&
                item.state !== State.DELETED &&
                item.folder == 'inbox'
              )
            }}
            showNavigationMenu={showNavigationMenu}
          />
        )
      case 'subscriptions':
        return <StashFeeds key={name} mode="read" />
      case 'watch':
        // ?v= opens a video on the player page.
        return typeof router.query.v == 'string' ? (
          <WatchPlayerPage key="player" id={router.query.v} />
        ) : (
          <StashFeeds key={name} mode="watch" />
        )
      case 'search':
        return (
          <LibraryContainer
            key={name}
            folder={undefined}
            filterFunc={(item) => {
              console.log('item: ', item)
              return true
            }}
            showNavigationMenu={showNavigationMenu}
          />
        )
      case 'archive':
        return (
          <LibraryContainer
            key={name}
            folder="archive"
            filterFunc={(item) => {
              return item.state == 'ARCHIVED'
            }}
            showNavigationMenu={showNavigationMenu}
          />
        )
      case 'trash':
        return (
          <LibraryContainer
            key={name}
            folder="trash"
            filterFunc={(item) => {
              return item.state == 'DELETED'
            }}
            showNavigationMenu={showNavigationMenu}
          />
        )
      case 'discover':
        return <StashDiscover key={name} />

      default:
        return <></>
    }
  }

  const sectionTitle = (section: NavigationSection | undefined) => {
    switch (section) {
      case 'home':
        return 'Home'
      case 'edition':
        return 'The Edition'
      case 'discover':
        return 'Discover'
      case 'library':
        return 'Library'
      case 'subscriptions':
        return 'Feeds'
      case 'watch':
        return 'Watch'
      case 'highlights':
        return 'Highlights'
      case 'archive':
        return 'Archive'
      case 'trash':
        return 'Trash'
    }
    return ''
  }

  return (
    <NavigationLayout
      section={section ?? 'home'}
      title={sectionTitle(section)}
      showNavigationMenu={showNavigationMenu}
      setShowNavigationMenu={setShowNavigationMenu}
    >
      {sectionView(section)}
    </NavigationLayout>
  )
}
