import React from 'react'
import ReactDOM from 'react-dom'
import { Box, VStack } from '@omnivore/web/components/elements/LayoutPrimitives'
import { ArticleContainer } from '@omnivore/web/components/templates/article/ArticleContainer'
import { applyStoredTheme } from '@omnivore/web/lib/themeUpdater'
import '@omnivore/web/styles/globals.css'
import '@omnivore/web/styles/articleInnerStyling.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Colophon } from './Colophon.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 4, // 4hrs
    },
  },
})

// The Stash app answers each request by calling window.stashReply with the
// request's id, rather than through a message reply.
const pendingRequests = new Map()
let nextRequestId = 1
window.stashDocumentID = `${Date.now()}-${Math.random().toString(36).slice(2)}`
window.stashReply = (requestId, result, error) => {
  const pending = pendingRequests.get(requestId)
  pendingRequests.delete(requestId)
  if (!pending) return
  clearTimeout(pending.timeout)
  if (error) pending.reject(new Error(error))
  else pending.resolve(result)
}

const mutation = async (name, input) => {
  if (window.stashApp) {
    const requestId = nextRequestId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId)
        reject(new Error("Couldn't save your changes. Try again."))
      }, 30000)
      pendingRequests.set(requestId, { resolve, reject, timeout })
      window.webkit.messageHandlers.stashAction.postMessage({
        actionID: name,
        requestId,
        documentID: window.stashDocumentID,
        input,
      })
    })
  } else if (window.webkit) {
    // Send iOS a message
    const result =
      await window?.webkit?.messageHandlers.articleAction?.postMessage({
        actionID: name,
        ...input,
      })
    return result.result
  } else {
    // Send android a message
    console.log('sending android a message', name, input)
    AndroidWebKitMessenger.handleIdentifiableMessage(
      name,
      JSON.stringify(input)
    )

    // TODO: handle errors
    switch (name) {
      case 'createHighlight':
        return input
      case 'deleteHighlight':
        return true
      case 'mergeHighlight':
        return {
          id: input['id'],
          type: input['type'],
          shortID: input['shortId'],
          quote: input['quote'],
          patch: input['patch'],
          createdByMe: true,
          labels: [],
        }
      case 'updateHighlight':
        return true
      case 'articleReadingProgress':
        return true
      default:
        return true
    }
  }
}

const App = () => {
  applyStoredTheme(false)

  const [pageTurn, setPageTurn] = React.useState(window.fullPageScroll ?? false)
  const [readingWidth, setReadingWidth] = React.useState(window.stashReaderWidth)

  React.useEffect(() => {
    if (!window.stashApp) return
    const paragraphs = () => [...document.querySelectorAll('[data-omnivore-anchor-idx]')]
    const capture = () => {
      const node = paragraphs().find((element) => element.getBoundingClientRect().bottom > 0)
      return node ? { node, top: node.getBoundingClientRect().top } : null
    }
    let anchor = capture()
    let restoring = false
    const restore = (position) => {
      if (!position?.node.isConnected) return
      restoring = true
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.scrollBy(0, position.node.getBoundingClientRect().top - position.top)
        restoring = false
        anchor = capture()
      }))
    }
    window.stashPreservePosition = (change) => {
      const position = capture()
      change()
      restore(position)
    }
    const scroll = () => { if (!restoring) anchor = capture() }
    const resize = () => restore(anchor)
    const width = (event) => setReadingWidth(event.width)
    window.addEventListener('scroll', scroll, { passive: true })
    window.addEventListener('resize', resize)
    document.addEventListener('stashReaderWidth', width)
    return () => {
      window.removeEventListener('scroll', scroll)
      window.removeEventListener('resize', resize)
      document.removeEventListener('stashReaderWidth', width)
      delete window.stashPreservePosition
    }
  }, [])

  React.useEffect(() => {
    const doPageTurn = (clientX) => () => doubleClickPageTurn({ clientX })
    const togglePageTurn = ({ pageTurnSetting }) => setPageTurn(pageTurnSetting)
    const pageUp = doPageTurn(0)
    const pageDown = doPageTurn(window.innerWidth)

    document.addEventListener('omnivoreSetPageTurn', togglePageTurn)
    document.addEventListener('omnivorePageUp', pageUp)
    document.addEventListener('omnivorePageDown', pageDown)

    return () => {
      document.removeEventListener('omnivoreSetPageTurn', togglePageTurn)
      document.removeEventListener('omnivorePageUp', pageUp)
      document.removeEventListener('omnivorePageUp', pageDown)
    }
  })

  const doubleClickPageTurn = (e) => {
    if (pageTurn) {
      const scrollDirection = e.clientX > window.innerWidth / 2 ? 1 : -1
      window.scroll(0, window.scrollY + window.innerHeight * scrollDirection)

      // Once we've finished scrolling, we need to calculate an offset.
      const elementsIntersection = document.elementsFromPoint(
        window.innerWidth / 2,
        1
      )
      const paragraph = elementsIntersection.find(
        (el) =>
          el.tagName != 'DIV' && el.hasAttribute('data-omnivore-anchor-idx')
      )

      if (paragraph) {
        const lineHeight = parseInt(
          window.getComputedStyle(paragraph).getPropertyValue('line-height')
        )

        const { top } = paragraph.getBoundingClientRect()
        const diff = (top * -1) % lineHeight
        // If we are 70% of the way through the lineheight, we can likely read the entire text.
        // It would be annoying to show the user the same line again when they double tap. Instead, we should go down to the
        // next line.
        const offset = lineHeight * 0.7 < diff ? (lineHeight - diff) * -1 : diff
        window.scroll(0, window.scrollY - offset)
      }
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Box
        css={{
          paddingTop: window.webkit ? 0 : '48px', // add 48px to android only
        }}
        onDoubleClick={doubleClickPageTurn}
      >
        <VStack
          alignment="center"
          distribution="center"
          className="disable-webkit-callout"
          style={{ backgroundColor: 'var(--colors-readerBg)' }}
        >
          <ArticleContainer
            article={window.omnivoreArticle}
            viewer={window.omnivoreViewer}
            labels={window.omnivoreArticle.labels}
            isAppleAppEmbed={true}
            highlightBarDisabled={!window.enableHighlightBar}
            fontSize={window.fontSize ?? 18}
            fontFamily={window.fontFamily ?? 'inter'}
            margin={readingWidth ? 1024 - readingWidth : window.margin}
            maxWidthPercentage={window.maxWidthPercentage}
            lineHeight={window.lineHeight}
            highlightOnRelease={window.highlightOnRelease}
            highContrastText={window.prefersHighContrastFont ?? true}
            justifyText={window.justifyText}
            footer={
              window.stashColophon ? (
                <Colophon data={window.stashColophon} />
              ) : undefined
            }
            articleMutations={{
              createHighlightMutation: (input) =>
                mutation('createHighlight', input),
              deleteHighlightMutation: (libraryItemId, highlightId) =>
                mutation('deleteHighlight', { libraryItemId, highlightId }),
              mergeHighlightMutation: (input) =>
                mutation('mergeHighlight', input),
              updateHighlightMutation: (input) =>
                mutation('updateHighlight', input),
              articleReadingProgressMutation: (input) =>
                mutation('articleReadingProgress', input),
              readingTrailQuery: (id) => mutation('readingTrail', { id }),
              saveReadingTrailMutation: (input) =>
                mutation('saveReadingTrail', input),
            }}
          />
        </VStack>
      </Box>
    </QueryClientProvider>
  )
}

ReactDOM.render(<App />, document.getElementById('root'))
