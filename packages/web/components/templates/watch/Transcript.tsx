import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchTranscript } from '../../../lib/networking/subscriptions/youtube'
import { formatTimecode } from '../../../lib/youtube'
import { motion } from '../../elements/stash/motion'
import { styled } from '../../tokens/stitches.config'

const List = styled('ol', {
  listStyle: 'none',
  margin: 0,
  padding: '0 0 8px',
  maxHeight: '60vh',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  '@mdDown': { maxHeight: 'none' },
})

const Line = styled('li', {
  display: 'grid',
  gridTemplateColumns: '52px minmax(0, 1fr)',
  gap: '10px',
  padding: '5px 8px',
  borderRadius: '$sm',
  cursor: 'pointer',
  transition: `background ${motion.fast}, color ${motion.fast}`,
  '& > span:first-child': {
    paddingTop: '3px',
    fontFamily: '$mono',
    fontSize: '$micro',
    color: '$stMuted',
    fontVariantNumeric: 'tabular-nums',
  },
  '& > span:last-child': {
    fontFamily: '$serif',
    fontSize: '15.5px',
    lineHeight: 1.55,
    color: '$stMuted',
  },
  '&:hover': { background: '$stSunken' },
  '&[aria-current="true"] > span': { color: '$stInk' },
  '&[aria-current="true"] > span:first-child': { color: '$stAccentText' },
  // Selecting text to copy shouldn't jump the video.
  userSelect: 'text',
})

const Note = styled('p', {
  margin: '6px 0 0',
  fontFamily: '$inter',
  fontSize: '$small',
  color: '$stMuted',
})

const Follow = styled('button', {
  all: 'unset',
  cursor: 'pointer',
  marginBottom: '8px',
  fontFamily: '$inter',
  fontSize: '$caption',
  color: '$stAccentText',
})

// The video's captions, scrolling along as it plays. Click a line to jump
// there. Scrolling the list yourself stops it following until you ask.
export function Transcript(props: {
  videoId: string
  time: number
  onSeek: (seconds: number) => void
}): JSX.Element {
  const { data, isPending, isError } = useQuery({
    queryKey: ['youtube-transcript', props.videoId],
    queryFn: () => fetchTranscript(props.videoId),
    staleTime: Infinity,
    retry: 1,
  })
  const lines = useMemo(() => data ?? [], [data])
  const current = useMemo(() => {
    let found = -1
    for (let i = 0; i < lines.length && lines[i].start <= props.time; i++) {
      found = i
    }
    return found
  }, [lines, props.time])

  const list = useRef<HTMLOListElement>(null)
  const [following, setFollowing] = useState(true)
  const scrolling = useRef(false)
  useEffect(() => {
    const element = list.current
    const row = element?.children[current] as HTMLElement | undefined
    if (!element || !row || !following) return
    scrolling.current = true
    element.scrollTo({
      top: row.offsetTop - element.offsetTop - element.clientHeight / 3,
      behavior: 'smooth',
    })
    const done = setTimeout(() => (scrolling.current = false), 600)
    return () => clearTimeout(done)
  }, [current, following])

  if (isPending) return <Note>Loading the transcript…</Note>
  if (isError) return <Note>Could not reach YouTube for the transcript.</Note>
  if (!lines.length) return <Note>This video has no captions on YouTube.</Note>

  return (
    <>
      {!following && (
        <Follow onClick={() => setFollowing(true)}>Follow the video</Follow>
      )}
      <List
        ref={list}
        onWheel={() => !scrolling.current && setFollowing(false)}
        onTouchMove={() => setFollowing(false)}
      >
        {lines.map((line, index) => (
          <Line
            key={index}
            aria-current={index == current}
            onClick={() => {
              if (window.getSelection()?.toString()) return
              props.onSeek(line.start)
              setFollowing(true)
            }}
          >
            <span>{formatTimecode(line.start)}</span>
            <span>{line.text}</span>
          </Line>
        ))}
      </List>
    </>
  )
}
