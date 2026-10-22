import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { saveUrlMutation } from '../../../lib/networking/mutations/saveUrlMutation'
import { showErrorToast } from '../../../lib/toastHelpers'
import { motion, pressable } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'

// The API stands this in for an article whose fetch never landed.
export const isUnparsedContent = (content: string | undefined) =>
  !!content && content.includes('We were unable to parse this page')

const Box = styled('div', {
  display: 'grid',
  gap: '12px',
  justifyItems: 'start',
  margin: '8px 0 24px',
  fontFamily: '$inter',
  color: '$stInk',
  '& p': { margin: 0, fontSize: '15px', lineHeight: 1.55 },
  '& p + p': { color: '$stMuted', fontSize: '$small' },
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
  height: '34px',
  padding: '0 14px',
  fontSize: '$small',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  borderRadius: '$sm',
  cursor: 'pointer',
  transition: `background ${motion.fast}`,
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
        textDecoration: 'none',
        '&:hover': { background: '$stSunken' },
      },
    },
  },
  defaultVariants: { primary: false },
})

// How long to keep checking after a retry before offering it again.
const RETRY_WATCH_MS = 90_000
const RETRY_CHECK_MS = 5_000

type ParseFailedNoticeProps = {
  url: string
  slug: string
}

// Shown in place of the article when the page couldn't be read. Trying
// again saves the link afresh and watches for the article to arrive; this
// notice goes away on its own once it does.
export function ParseFailedNotice(props: ParseFailedNoticeProps): JSX.Element {
  const queryClient = useQueryClient()
  const [retrying, setRetrying] = useState(false)
  const timers = useRef<ReturnType<typeof setInterval>[]>([])

  useEffect(() => {
    const running = timers.current
    return () => running.forEach((timer) => clearInterval(timer))
  }, [])

  const retry = async () => {
    setRetrying(true)
    const result = await saveUrlMutation(props.url)
    if (!result?.clientRequestId) {
      setRetrying(false)
      showErrorToast('Could not try again. Check your connection.')
      return
    }
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - startedAt > RETRY_WATCH_MS) {
        clearInterval(timer)
        setRetrying(false)
        return
      }
      queryClient.invalidateQueries({ queryKey: ['libraryItem', props.slug] })
    }, RETRY_CHECK_MS)
    timers.current.push(timer)
  }

  return (
    <Box>
      <p>Stash couldn’t read this page when it was saved.</p>
      <p>
        {retrying
          ? 'Reading it again… this takes up to a minute.'
          : 'The site may have been slow or blocked the reader. Trying again usually works.'}
      </p>
      <Buttons>
        <Button primary onClick={retry} disabled={retrying}>
          {retrying ? 'Trying again…' : 'Try again'}
        </Button>
        <Button
          as="a"
          href={props.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          Open original
        </Button>
      </Buttons>
    </Box>
  )
}
