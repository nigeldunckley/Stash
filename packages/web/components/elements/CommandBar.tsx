import {
  ActionImpl,
  KBarAnimator,
  KBarPortal,
  KBarPositioner,
  KBarResults,
  KBarSearch,
  Priority,
  useKBar,
  useMatches,
  useRegisterActions,
  VisualState,
} from 'kbar'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { gql } from 'graphql-request'
import { useQuery } from '@tanstack/react-query'
import {
  Article,
  ClipboardText,
  Highlighter,
  MagnifyingGlass,
  Moon,
  Sun,
} from '@phosphor-icons/react'
import { styled } from '../tokens/stitches.config'
import { glassStrong, hairlineEdge } from './stash/material'
import { gqlFetcher } from '../../lib/networking/networkHelpers'
import { gqlSearchQuery } from '../../lib/networking/library_items/gql'
import { LibraryItemNode } from '../../lib/networking/library_items/useLibraryItems'
import { useGetViewer } from '../../lib/networking/viewer/useGetViewer'
import { useHandleAddUrl } from '../../lib/hooks/useHandleAddUrl'
import { formatMinutes, readingMinutes } from '../../lib/readingTime'
import { siteName } from '../../lib/textFormatting'
import { updateTheme } from '../../lib/themeUpdater'
import { ThemeId } from '../tokens/stitches.config'
import { navigationCommands } from '../../lib/keyboardShortcuts/navigationShortcuts'

// Sections, highest first. Commands pages register (reader font, archive
// and so on) fall in below these.
const SECTIONS = {
  save: { name: 'Save', priority: 1000 },
  articles: { name: 'Articles', priority: 100 },
  highlights: { name: 'Highlights', priority: 50 },
}

const Animator = styled(KBarAnimator, {
  width: 'min(600px, calc(100vw - 32px))',
  overflow: 'hidden',
  fontFamily: '$inter',
  color: '$stInk',
  ...glassStrong,
  ...hairlineEdge,
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(9, 9, 11, 0.06), 0 30px 70px -20px rgba(9, 9, 11, 0.45)',
})

const Query = styled('label', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '0 16px',
  borderBottom: '1px solid $stLine',
  color: '$stMuted',
})

const Search = styled(KBarSearch, {
  flex: 1,
  minWidth: 0,
  height: '50px',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontFamily: '$inter',
  fontSize: '16px',
  color: '$stInk',
  caretColor: '$stAccent',
  '&::placeholder': { color: '$stMuted' },
})

const GroupName = styled('div', {
  padding: '10px 16px 4px',
  fontFamily: '$mono',
  fontSize: '10.5px',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: '$stMuted',
})

const Item = styled('div', {
  display: 'grid',
  gridTemplateColumns: '20px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '10px',
  margin: '0 6px',
  padding: '8px 10px',
  borderRadius: '8px',
  fontSize: '14px',
  cursor: 'pointer',
  '& > svg': { color: '$stMuted' },
  '&[data-active="true"]': {
    background: '$stSunken',
  },
})

const Name = styled('span', {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  '&[data-kind="article"]': { fontFamily: '$serif', fontSize: '15.5px' },
  '&[data-kind="highlight"]': {
    fontFamily: '$serif',
    fontSize: '15.5px',
    fontStyle: 'italic',
  },
  mark: {
    background: '$stAccentTint',
    color: 'inherit',
    borderRadius: '2px',
    padding: '0 1px',
  },
})

const Hint = styled('span', {
  maxWidth: '240px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontFamily: '$mono',
  fontSize: '11px',
  color: '$stMuted',
  whiteSpace: 'nowrap',
  '& kbd': { marginLeft: '4px' },
  // Phones give the whole line to the title.
  '@smDown': { '&[data-kind]': { display: 'none' } },
})

const Kbd = styled('kbd', {
  fontFamily: '$mono',
  fontSize: '10.5px',
  lineHeight: '16px',
  padding: '0 5px',
  border: '1px solid $stLine',
  borderRadius: '4px',
  color: '$stMuted',
  background: '$stSurface',
})

const Foot = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '14px',
  padding: '8px 16px',
  borderTop: '1px solid $stLine',
  fontSize: '11.5px',
  color: '$stMuted',
  '@mdDown': { display: 'none' },
})

const Results = styled('div', {
  // KBarResults virtualises its list and sets its own height.
  '& > div': { maxHeight: 'min(420px, 60vh)', overscrollBehavior: 'contain' },
})

// Wraps the first match of the search in a <mark>.
const marked = (text: string, search: string): React.ReactNode => {
  const query = search.trim()
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (at < 0) {
    return text
  }
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  )
}

const kindOf = (action: ActionImpl): string | undefined =>
  action.id.startsWith('cmd-article-')
    ? 'article'
    : action.id.startsWith('cmd-highlight-')
    ? 'highlight'
    : undefined

function CommandResults(): JSX.Element {
  const { results } = useMatches()
  const { search } = useKBar((state) => ({ search: state.searchQuery }))

  return (
    <Results>
      <KBarResults
        items={results}
        onRender={({ item, active }) =>
          typeof item === 'string' ? (
            <GroupName>{item}</GroupName>
          ) : (
            <Item data-active={active}>
              {item.icon ?? <span />}
              <Name data-kind={kindOf(item)}>
                {kindOf(item) ? marked(item.name, search) : item.name}
              </Name>
              <Hint data-kind={kindOf(item)}>
                {item.subtitle}
                {item.shortcut?.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </Hint>
            </Item>
          )
        }
      />
    </Results>
  )
}

const THEME_ACTIONS = [
  {
    id: 'cmd-theme-light',
    section: 'Appearance',
    name: 'Light theme',
    shortcut: ['v', 'l'],
    keywords: 'theme,light,appearance',
    icon: <Sun size={16} />,
    priority: Priority.LOW,
    perform: () => updateTheme(ThemeId.Light),
  },
  {
    id: 'cmd-theme-dark',
    section: 'Appearance',
    name: 'Dark theme',
    shortcut: ['v', 'd'],
    keywords: 'theme,dark,appearance,night',
    icon: <Moon size={16} />,
    priority: Priority.LOW,
    perform: () => updateTheme(ThemeId.Dark),
  },
]

// ⌘K: one box to find articles and highlights, save a link and run
// commands. On iPhone the search button in the top bar opens it.
export function CommandBar(): JSX.Element {
  const router = useRouter()
  // Registered all the time so their shortcuts (g then l, and so on) work
  // with the bar closed.
  useRegisterActions([...navigationCommands(router), ...THEME_ACTIONS], [])

  const { visible } = useKBar((state) => ({
    visible: state.visualState !== VisualState.hidden,
  }))

  return (
    <>
      {visible && <CommandSources />}
      <KBarPortal>
        <KBarPositioner
          style={{
            zIndex: 100,
            background: 'var(--colors-stScrim)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            padding: '12vh 16px 16px',
          }}
        >
          <Animator>
            <Query>
              <MagnifyingGlass size={16} />
              <Search defaultPlaceholder="Search Stash, paste a link, or type a command" />
            </Query>
            <CommandResults />
            <Foot>
              <span>
                <Kbd>↑↓</Kbd> move
              </span>
              <span>
                <Kbd>↵</Kbd> open
              </span>
              <span>
                <Kbd>esc</Kbd> close
              </span>
            </Foot>
          </Animator>
        </KBarPositioner>
      </KBarPortal>
    </>
  )
}

const looksLikeUrl = (text: string): string | undefined => {
  const value = text.trim()
  if (!value || /\s/.test(value)) {
    return undefined
  }
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`
    )
    return url.hostname.includes('.') ? url.toString() : undefined
  } catch {
    return undefined
  }
}

const shortUrl = (url: string) =>
  url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)

const useDebounced = (value: string, ms: number) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

type HighlightHit = {
  id: string
  quote?: string
  annotation?: string
  libraryItem: { id: string; title: string; slug: string }
}

const GQL_RECENT_HIGHLIGHTS = gql`
  query CommandBarHighlights($first: Int) {
    highlights(first: $first) {
      ... on HighlightsSuccess {
        edges {
          node {
            id
            quote
            annotation
            libraryItem {
              id
              title
              slug
            }
          }
        }
      }
    }
  }
`

// Mounted only while the bar is open, so nothing is fetched until then.
function CommandSources(): null {
  const router = useRouter()
  const addUrl = useHandleAddUrl()
  const { data: viewer } = useGetViewer()
  const username = viewer?.profile.username
  const { search } = useKBar((state) => ({ search: state.searchQuery }))
  const query = useDebounced(search.trim(), 180)
  const [clipboardUrl, setClipboardUrl] = useState<string>()

  // Browsers that have already allowed reading the clipboard show its link
  // straight away. Safari asks each time, so there it's a command instead.
  useEffect(() => {
    let cancelled = false
    const read = async () => {
      try {
        const status = await navigator.permissions.query({
          name: 'clipboard-read' as PermissionName,
        })
        if (status.state !== 'granted') {
          return
        }
        const url = looksLikeUrl(await navigator.clipboard.readText())
        if (!cancelled) setClipboardUrl(url)
      } catch {
        // Not supported here.
      }
    }
    read()
    return () => {
      cancelled = true
    }
  }, [])

  const save = (url: string) => {
    const locale = navigator.language
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    addUrl(url, timezone, locale)
  }

  const { data: articles } = useQuery({
    queryKey: ['command-bar', 'articles', query],
    enabled: query.length >= 2 && !looksLikeUrl(query),
    staleTime: 30_000,
    queryFn: async () => {
      const response = (await gqlFetcher(gqlSearchQuery(), {
        first: 6,
        query: `in:all ${query.replace(/"/g, '')}`,
        includeContent: false,
      })) as {
        search?: { edges?: { node: LibraryItemNode }[] }
      }
      return (response.search?.edges ?? []).map((edge) => edge.node)
    },
  })

  const { data: highlights } = useQuery({
    queryKey: ['command-bar', 'highlights'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const response = (await gqlFetcher(GQL_RECENT_HIGHLIGHTS, {
        first: 300,
      })) as { highlights?: { edges?: { node: HighlightHit }[] } }
      return (response.highlights?.edges ?? []).map((edge) => edge.node)
    },
  })

  const open = (slug: string) => {
    if (username) {
      router.push(`/${username}/${slug}`)
    }
  }

  const typedUrl = looksLikeUrl(search)

  const saveActions = useMemo(() => {
    const url = typedUrl ?? clipboardUrl
    if (url) {
      return [
        {
          id: 'cmd-save-url',
          section: SECTIONS.save,
          name: `Save ${shortUrl(url)}`,
          keywords: `${search},save,link,clipboard`,
          icon: <ClipboardText size={16} />,
          perform: () => save(url),
        },
      ]
    }
    return [
      {
        id: 'cmd-save-clipboard',
        section: SECTIONS.save,
        name: 'Save the link on your clipboard',
        keywords: 'save,paste,clipboard,link,add',
        icon: <ClipboardText size={16} />,
        perform: async () => {
          try {
            const url = looksLikeUrl(await navigator.clipboard.readText())
            if (url) save(url)
          } catch {
            // The person declined, or there's nothing to paste.
          }
        },
      },
    ]
  }, [typedUrl, clipboardUrl, search])

  const articleActions = useMemo(
    () =>
      (articles ?? []).map((item) => ({
        id: `cmd-article-${item.id}`,
        section: SECTIONS.articles,
        name: item.title,
        subtitle: [
          siteName(item.originalArticleUrl, item.url, item.siteName),
          item.state == 'ARCHIVED'
            ? 'Archived'
            : formatMinutes(readingMinutes(item.wordsCount)),
        ]
          .filter(Boolean)
          .join(' · '),
        // The server already matched these, so keep them whatever kbar's
        // own matching thinks.
        keywords: [query, search, item.siteName ?? ''].join(','),
        icon: <Article size={16} />,
        perform: () => open(item.slug),
      })),
    [articles, query, search, username]
  )

  const highlightActions = useMemo(() => {
    const needle = query.toLowerCase()
    if (needle.length < 3) {
      return []
    }
    return (highlights ?? [])
      .filter((highlight) =>
        `${highlight.quote ?? ''} ${highlight.annotation ?? ''}`
          .toLowerCase()
          .includes(needle)
      )
      .slice(0, 4)
      .map((highlight) => {
        const text = (highlight.quote ?? highlight.annotation ?? '')
          .replace(/\s+/g, ' ')
          .trim()
        const at = text.toLowerCase().indexOf(needle)
        // Start near the match so it is visible in one line.
        const excerpt = at > 40 ? `…${text.slice(at - 30)}` : text
        return {
          id: `cmd-highlight-${highlight.id}`,
          section: SECTIONS.highlights,
          name: `“${excerpt}”`,
          subtitle: highlight.libraryItem.title,
          keywords: [query, search].join(','),
          icon: <Highlighter size={16} />,
          perform: () => open(highlight.libraryItem.slug),
        }
      })
  }, [highlights, query, search, username])

  useRegisterActions(saveActions, [saveActions])
  useRegisterActions(articleActions, [articleActions])
  useRegisterActions(highlightActions, [highlightActions])

  return null
}
