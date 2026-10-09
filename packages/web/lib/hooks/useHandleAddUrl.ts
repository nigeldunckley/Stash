import { useCallback } from 'react'
import { gql } from 'graphql-request'
import { v4 as uuidv4 } from 'uuid'
import { useRouter } from 'next/router'
import {
  useAddItem,
  useDeleteItem,
} from '../networking/library_items/useLibraryItems'
import { gqlFetcher } from '../networking/networkHelpers'
import { gqlSearchQuery } from '../networking/library_items/gql'
import { formatMinutes, readingMinutes } from '../readingTime'
import { showSaveToast } from '../../components/elements/stash/SaveToast'

const GQL_SAVING_STATUS = gql`
  query SaveStatus($id: ID) {
    articleSavingRequest(id: $id) {
      ... on ArticleSavingRequestSuccess {
        articleSavingRequest {
          status
          slug
          user {
            id
            profile {
              id
              username
            }
          }
        }
      }
      ... on ArticleSavingRequestError {
        errorCodes
      }
    }
  }
`

type SaveStatus = {
  status?: string
  slug?: string
  user?: { profile?: { username?: string } }
}

type SavedItem = {
  title?: string
  slug?: string
  wordsCount?: number
  readingProgressPercent?: number
}

type SaveStatusData = {
  articleSavingRequest?: { articleSavingRequest?: SaveStatus }
}

const POLL_EVERY_MS = 800
const POLL_FOR_MS = 30000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Waits until Stash has read the page, or gives up quietly.
const waitForPage = async (id: string): Promise<SaveStatus | undefined> => {
  const until = Date.now() + POLL_FOR_MS
  let last: SaveStatus | undefined
  while (Date.now() < until) {
    try {
      const data = (await gqlFetcher(GQL_SAVING_STATUS, {
        id,
      })) as SaveStatusData
      last = data.articleSavingRequest?.articleSavingRequest
      if (last?.status && last.status != 'PROCESSING') {
        return last
      }
    } catch {
      // Try again on the next tick.
    }
    await sleep(POLL_EVERY_MS)
  }
  return last
}

// The saving request only reports status, so the title and length come
// from the item itself.
const fetchItem = async (id: string): Promise<SavedItem | undefined> => {
  try {
    const data = (await gqlFetcher(gqlSearchQuery(), {
      first: 1,
      query: `in:all includes:${id}`,
      includeContent: false,
    })) as { search?: { edges?: { node: SavedItem }[] } }
    return data.search?.edges?.[0]?.node
  } catch {
    return undefined
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const errorMessage = (error: unknown): string => {
  const code = error instanceof Error ? error.message : String(error)
  if (/UNAUTHORIZED/i.test(code)) {
    return 'You’re signed out. Sign in again, then save the link.'
  }
  if (/BAD_DATA|INVALID|URL/i.test(code)) {
    return 'That doesn’t look like a web address Stash can save.'
  }
  return 'Stash couldn’t be reached. Check your connection and try again.'
}

export const useHandleAddUrl = () => {
  const router = useRouter()
  const addItem = useAddItem()
  const deleteItem = useDeleteItem()

  const save = useCallback(
    async (url: string, timezone: string, locale: string): Promise<void> => {
      const host = hostOf(url)
      const id = showSaveToast({ kind: 'saving', host })
      const retry = () => {
        save(url, timezone, locale)
      }

      let savedId: string | undefined
      const itemId = uuidv4()
      try {
        savedId = await addItem.mutateAsync({ itemId, url, timezone, locale })
      } catch (error) {
        showSaveToast(
          {
            kind: 'failed',
            host,
            message: errorMessage(error),
            actions: [{ label: 'Try again', onClick: retry, primary: true }],
          },
          id
        )
        return
      }
      if (!savedId) {
        showSaveToast(
          {
            kind: 'failed',
            host,
            message: 'Stash didn’t accept the link. Try again in a moment.',
            actions: [{ label: 'Try again', onClick: retry, primary: true }],
          },
          id
        )
        return
      }

      // The API keeps the existing item's id when the link is already
      // saved, so a different id means it was in Stash before.
      const alreadySaved = savedId != itemId
      let path: string | undefined
      let slug = ''
      const open = () =>
        router.push(path ?? `/article?url=${encodeURIComponent(url)}`)
      const undo = () => {
        deleteItem.mutate({ itemId: savedId as string, slug })
      }
      const actionsFor = (already: boolean) =>
        already
          ? [{ label: 'Open article', onClick: open, primary: true }]
          : [
              { label: 'Read now', onClick: open, primary: true },
              { label: 'Undo', onClick: undo },
            ]

      // Saved as far as the library is concerned; the title follows once
      // the page has been read.
      showSaveToast(
        {
          kind: alreadySaved ? 'already' : 'saved',
          host,
          actions: actionsFor(alreadySaved),
        },
        id,
        Infinity
      )

      // Callers wait only for the save itself; the toast keeps updating.
      void finish(savedId)
      async function finish(savedId: string) {
        const result = await waitForPage(savedId)
        const username = result?.user?.profile?.username
        slug = result?.slug ?? ''
        if (username && slug) {
          path = `/${username}/${slug}`
        }

        if (
          result?.status == 'FAILED' ||
          result?.status == 'CONTENT_NOT_FETCHED'
        ) {
          showSaveToast(
            {
              kind: 'partial',
              host,
              message: `Stash couldn’t read the page, so it only has the title and link. Sites that need a sign-in often do this.`,
              actions: [
                { label: 'Try again', onClick: retry },
                {
                  label: 'Open original',
                  onClick: () => window.open(url, '_blank', 'noopener'),
                },
              ],
            },
            id
          )
          return
        }

        const article = await fetchItem(savedId)
        slug = article?.slug || slug
        if (username && slug) {
          path = `/${username}/${slug}`
        }
        const title =
          article?.title && article.title != url ? article.title : undefined
        const minutes = formatMinutes(readingMinutes(article?.wordsCount))
        const progress = Math.round(article?.readingProgressPercent ?? 0)
        const detail = alreadySaved
          ? progress > 0 && progress < 100
            ? `${progress}% read`
            : minutes
          : minutes
        showSaveToast(
          {
            kind: alreadySaved ? 'already' : 'saved',
            host,
            title,
            detail,
            actions: actionsFor(alreadySaved),
          },
          id
        )
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router]
  )

  return useCallback(
    (url: string, timezone: string, locale: string) =>
      save(url, timezone, locale),
    [save]
  )
}
